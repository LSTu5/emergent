"""Exercise the real checkpoint and the same HTTP boundary used by the Engine."""
import json
import threading
import time
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import numpy as np

from runtime import MODEL_NAME, DecisionModel
from server import ChoiceServer


def decision(state, choices=None):
    return {"state": state, "question": {
        "type": "choice", "instructions": "Predict the visitor group's next destination.",
        "criteria": choices or {"meal": "Eat at Pier Market", "view": "Visit the sea lion docks",
                                "rest": "Sit on an available bench"},
    }}


class LocalChoiceChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.model = DecisionModel()
        cls.server = ChoiceServer(0, cls.model)
        cls.worker = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.worker.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.worker.join()

    def post(self, value, headers=None):
        req = Request(self.url + "/predict", data=json.dumps(value).encode(),
                      headers={"Content-Type": "application/json", **(headers or {})})
        try:
            with urlopen(req, timeout=30) as response:
                return response.status, json.load(response)
        except HTTPError as response:
            return response.code, json.load(response)

    def test_checkpoint_parity_and_isolation(self):
        cases = [decision(f"The group is {need}; it has 45 minutes and a $50 budget.")
                 for need in ["hungry", "tired", "interested in wildlife"]]
        actual = self.model.predict(cases)
        for case, observed in zip(cases, actual):
            expected = self.model.agent.predict(case["state"], {"next": case["question"]})
            expected = expected["answers"]["next"]["probabilities"]
            np.testing.assert_allclose(list(observed["probabilities"].values()),
                                       list(expected.values()), atol=.002, rtol=0)
            self.assertAlmostEqual(sum(observed["probabilities"].values()), 1, places=5)
            self.assertFalse(observed["truncated"])
        shuffled = self.model.predict(list(reversed(cases)))
        for first, second in zip(actual, reversed(shuffled)):
            np.testing.assert_allclose(list(first["probabilities"].values()),
                                       list(second["probabilities"].values()), atol=.002, rtol=0)

    def test_single_choice(self):
        result = self.model.predict([decision("The visit is over.", {"exit": "Leave the pier"})])
        self.assertEqual(result[0]["probabilities"], {"exit": 1})

    def test_validation_before_inference(self):
        for batch in [[], [decision("Visitor")] * 17, [None],
                      [decision("Visitor", {"a": ""})]]:
            with self.subTest(batchSize=len(batch)):
                with self.assertRaises(ValueError):
                    self.model.predict(batch)
        with self.assertRaisesRegex(ValueError, "token budget"):
            self.model.predict([decision("visitor information " * 4000)])

    def test_http_contract(self):
        with urlopen(self.url + "/health", timeout=5) as response:
            self.assertEqual(json.load(response)["service"], "emergent-choice-v1")
        payload = {"model": MODEL_NAME, "items": [decision("A group is hungry.")]}
        status, value = self.post(payload)
        self.assertEqual(status, 200)
        self.assertEqual(value["model"], MODEL_NAME)
        self.assertEqual(len(value["results"]), 1)
        self.assertFalse(value["results"][0]["truncated"])
        self.assertEqual(self.post({**payload, "model": "wrong"})[0], 400)
        self.assertEqual(self.post(payload, {"Origin": "https://example.com"})[0], 403)
        self.assertEqual(self.post({"model": MODEL_NAME, "items": []})[0], 422)


if __name__ == "__main__":
    started = time.perf_counter()
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(LocalChoiceChecks))
    print(json.dumps({"service": "emergent-choice-v1", "tests": result.testsRun,
                      "passed": result.wasSuccessful(), "seconds": time.perf_counter() - started}))
    raise SystemExit(0 if result.wasSuccessful() else 1)
