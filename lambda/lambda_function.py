"""
open-ai-chatbot - AWS Lambda handler (Python 3.12)

Serverless chatbot backend exposed through a Lambda Function URL.
  * POST    -> send `user_prompt` to OpenAI's Responses API and return `ai_reply`
  * other   -> 405 Method Not Allowed

CORS is configured on the Function URL itself (allow origin *, allow
methods POST, allow headers content-type). AWS answers the OPTIONS preflight
and adds the Access-Control-* headers, so this code sets none of them.

Conversation history (last 6 messages per user) is kept in the DynamoDB
table `chat-history` (PK: user_id [S], SK: timestamp [N]).

Environment variables:
  OPENAI_API_KEY  - OpenAI API key (set in the Lambda console, never in code)
  OPENAI_MODEL    - model name (default: gpt-4o-mini)
  TABLE_NAME      - DynamoDB table name (default: chat-history)
"""

import base64
import json
import os
import time

import boto3
from boto3.dynamodb.conditions import Key
from openai import OpenAI

OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
TABLE_NAME = os.environ.get("TABLE_NAME", "chat-history")
HISTORY_LIMIT = 6

SYSTEM_PROMPT = "You are a helpful, friendly AI assistant. Keep answers concise."

# Created once per execution environment (reused across warm invocations)
table = boto3.resource("dynamodb").Table(TABLE_NAME)
_client = None


def get_openai_client():
    """Lazily create the OpenAI client (reads OPENAI_API_KEY from the environment)."""
    global _client
    if _client is None:
        _client = OpenAI()
    return _client


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def get_method(event):
    """HTTP method from a Function URL event (payload v2.0).

    The Lambda console Test event has no requestContext, so we treat a
    missing method as POST to allow testing from the Test tab.
    """
    method = (
        event.get("requestContext", {}).get("http", {}).get("method")
        or event.get("httpMethod")  # API Gateway v1 style, just in case
        or "POST"
    )
    return method.upper()


def parse_body(event):
    body = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8")
    if isinstance(body, dict):
        return body
    return json.loads(body)


def load_history(user_id):
    """Return the last HISTORY_LIMIT messages for the user, oldest first."""
    result = table.query(
        KeyConditionExpression=Key("user_id").eq(user_id),
        ScanIndexForward=False,  # newest first
        Limit=HISTORY_LIMIT,
    )
    items = reversed(result.get("Items", []))  # back to chronological order
    return [{"role": item["role"], "content": item["content"]} for item in items]


def save_messages(user_id, user_prompt, ai_reply):
    now_ms = int(time.time() * 1000)
    with table.batch_writer() as batch:
        batch.put_item(Item={
            "user_id": user_id,
            "timestamp": now_ms,
            "role": "user",
            "content": user_prompt,
        })
        batch.put_item(Item={
            "user_id": user_id,
            "timestamp": now_ms + 1,  # keeps the reply strictly after the prompt
            "role": "assistant",
            "content": ai_reply,
        })


def lambda_handler(event, context):
    method = get_method(event)

    if method != "POST":
        return response(405, {"error": f"Method {method} not allowed. Use POST."})

    try:
        body = parse_body(event)
    except (ValueError, TypeError):
        return response(400, {"error": "Request body must be valid JSON."})

    user_prompt = (body.get("user_prompt") or "").strip()
    if not user_prompt:
        return response(400, {"error": "Missing required field 'user_prompt'."})
    user_id = str(body.get("user_id") or "anonymous")

    try:
        history = load_history(user_id)
        messages = history + [{"role": "user", "content": user_prompt}]

        start = time.perf_counter()
        ai_response = get_openai_client().responses.create(
            model=OPENAI_MODEL,
            instructions=SYSTEM_PROMPT,
            input=messages,
        )
        openai_response_time_ms = round((time.perf_counter() - start) * 1000, 2)

        ai_reply = ai_response.output_text
        save_messages(user_id, user_prompt, ai_reply)
    except Exception as exc:  # surface a clean JSON error to the client
        print(f"ERROR: {exc!r}")
        return response(500, {"error": "Failed to generate a reply.", "details": str(exc)})

    return response(200, {
        "ai_reply": ai_reply,
        "openai_response_time_ms": openai_response_time_ms,
    })
