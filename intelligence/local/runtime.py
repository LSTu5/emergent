"""Typed visitor-choice inference over the pinned Laya MLX dependency."""
from dataclasses import dataclass
from threading import Lock

import laya_mlx
import numpy as np
from laya_mlx.agent import collate_items
from laya_mlx.common import temp_bucket

CHECKPOINT = "aac6fef/laya-multilingual-mlx"
CHECKPOINT_REVISION = "f2b4faf51023039425946074e2cf1361d2db11d5"
MODEL_NAME = "laya-multilingual-mlx-f2b4faf5"
BATCH_LIMIT = 16


@dataclass(frozen=True)
class VisitorChoice:
    state: str
    question: dict

    @classmethod
    def parse(cls, value):
        if not isinstance(value, dict) or not isinstance(value.get("state"), str):
            raise ValueError("Each item needs a text visitor state")
        question = value.get("question")
        if not isinstance(question, dict) or question.get("type") != "choice":
            raise ValueError("Visitor decisions must be choice questions")
        choices = question.get("criteria")
        if not isinstance(choices, dict) or not 1 <= len(choices) <= 32:
            raise ValueError("A visitor decision needs 1 to 32 named options")
        if any(not isinstance(k, str) or not k or not isinstance(v, str) or not v
               for k, v in choices.items()):
            raise ValueError("Option names and descriptions must be nonempty text")
        instruction = question.get("instructions")
        if not isinstance(instruction, str) or not instruction.strip():
            raise ValueError("A decision instruction is required")
        return cls(value["state"], question)


class DecisionModel:
    """One loaded checkpoint; each batch row represents a separate visitor group."""

    def __init__(self, agent=None):
        self.agent = agent if agent is not None else laya_mlx.load(
            CHECKPOINT, revision=CHECKPOINT_REVISION, dtype="float16",
            batch_size=BATCH_LIMIT,
        )
        self.lock = Lock()

    def health(self):
        return {"ready": True, "model": MODEL_NAME, "checkpoint": CHECKPOINT,
                "revision": CHECKPOINT_REVISION, "service": "emergent-choice-v1"}

    def predict(self, values):
        if not isinstance(values, list) or not 1 <= len(values) <= BATCH_LIMIT:
            raise ValueError(f"A batch must contain 1 to {BATCH_LIMIT} visitor decisions")
        requests = [VisitorChoice.parse(value) for value in values]
        with self.lock:
            features = []
            for request in requests:
                rows, _ = self.agent.prepare(request.state, {"next": request.question})
                feature = rows[0]
                if feature["state_stats"]["state_tokens_dropped"] != 0:
                    raise ValueError("Visitor context exceeds the model token budget")
                stats = feature["options"]
                if stats["options"] != stats["options_distinct"]:
                    raise ValueError("Options must remain distinct after tokenization")
                features.append(feature)

            # The dependency handles padding and attention masks. No states are concatenated.
            tensors = collate_items(features, self.agent.tok.pad_token_id)
            raw, _ = self.agent.forward(tensors)
            logits = np.asarray(raw)
            answers = []
            for row, request in enumerate(requests):
                names = tuple(request.question["criteria"])
                kind = features[row]["qtype"]
                temperature = self.agent.temperature_by_options.get(
                    temp_bucket(kind, len(names)), self.agent.temperature[kind]
                )
                scores = logits[row, :len(names)] / temperature
                if not np.isfinite(scores).all():
                    raise RuntimeError("Checkpoint returned invalid decision scores")
                mass = np.exp(scores - np.max(scores))
                probabilities = mass / np.sum(mass)
                answers.append({
                    "probabilities": {name: float(p) for name, p in zip(names, probabilities)},
                    "confidence": float(np.max(probabilities)),
                    "inputTokens": len(features[row]["ids"]),
                    "truncated": False,
                })
            return answers
