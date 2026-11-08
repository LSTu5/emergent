"""Local HTTP transport for Emergent visitor choices; no external inference service."""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from time import perf_counter

from runtime import CHECKPOINT_REVISION, MODEL_NAME, DecisionModel

BODY_LIMIT = 256 * 1024


class RequestProblem(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


class ChoiceServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, port, model):
        self.model = model
        super().__init__(("127.0.0.1", port), ChoiceHandler)


class ChoiceHandler(BaseHTTPRequestHandler):
    server_version = "EmergentLocal/1"

    def log_message(self, *_args):
        # Visitor observations are not written to access logs.
        return

    def reply(self, status, payload):
        encoded = json.dumps(payload, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        try:
            self.wfile.write(encoded)
        except (BrokenPipeError, ConnectionResetError):
            return

    def read_request(self):
        if self.headers.get("Origin"):
            raise RequestProblem(403, "Use the simulator Engine to request decisions")
        if self.headers.get_content_type() != "application/json":
            raise RequestProblem(415, "JSON content is required")
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise RequestProblem(400, "Invalid content length")
        if not 1 <= length <= BODY_LIMIT:
            raise RequestProblem(413, "Decision request exceeds the allowed size")
        self.connection.settimeout(30)
        try:
            payload = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeError):
            raise RequestProblem(400, "Malformed JSON request")
        if not isinstance(payload, dict) or payload.get("model") != MODEL_NAME:
            raise RequestProblem(400, "The request must select the loaded checkpoint")
        return payload

    def do_GET(self):
        if self.path == "/health":
            self.reply(200, self.server.model.health())
        else:
            self.reply(404, {"error": "Unknown local inference route"})

    def do_POST(self):
        if self.path != "/predict":
            self.reply(404, {"error": "Unknown local inference route"})
            return
        try:
            payload = self.read_request()
            started = perf_counter()
            answers = self.server.model.predict(payload.get("items"))
            self.reply(200, {"model": MODEL_NAME,
                             "checkpointRevision": CHECKPOINT_REVISION,
                             "results": answers,
                             "inferenceMs": (perf_counter() - started) * 1000})
        except RequestProblem as error:
            self.reply(error.status, {"error": error.message})
        except ValueError as error:
            self.reply(422, {"error": str(error)})
        except TimeoutError:
            self.reply(408, {"error": "Decision request timed out"})
        except Exception as error:
            print(json.dumps({"event": "emergent.inference.error",
                              "type": type(error).__name__}), flush=True)
            self.reply(500, {"error": "Local decision inference failed"})


def serve():
    print(json.dumps({"event": "emergent.inference.loading", "model": MODEL_NAME}), flush=True)
    model = DecisionModel()
    model.predict([{"state": "A visitor has finished exploring PIER 39.",
                    "question": {"type": "choice", "instructions": "Select the next action.",
                                 "criteria": {"exit": "Leave the pier"}}}])
    port = int(os.environ.get("LAYA_PORT", "4318"))
    with ChoiceServer(port, model) as server:
        print(json.dumps({"event": "emergent.inference.ready", "port": port,
                          **model.health()}), flush=True)
        server.serve_forever()


if __name__ == "__main__":
    serve()
