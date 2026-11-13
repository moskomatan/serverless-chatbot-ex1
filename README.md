# Exercise 1: Serverless Chatbot with AWS Lambda and the OpenAI API

A serverless chatbot with these parts:
- a **Python 3.12 AWS Lambda** that calls **OpenAI's Responses API**
- a **Lambda Function URL** that exposes it
- **DynamoDB**, which stores the conversation history
- a **React** web UI hosted on **AWS Amplify**

The UI also measures response times and graphs them.

## Live URLs

| | URL |
|---|---|
| **Lambda Function URL** | https://kchz5of665zqvvjk3voujswyq40blldm.lambda-url.us-east-1.on.aws/ |
| **Amplify site** | https://main.d3jq7crkpzupwr.amplifyapp.com |

## Architecture

```
Browser (React app on AWS Amplify)
   │  POST {user_prompt, user_id}         ← total request time measured here
   ▼
Lambda Function URL (auth: NONE, CORS configured on the Function URL)
   ▼
Lambda  open-ai-chatbot  (python3.12, LabRole, layer: openai-python312)
   ├── DynamoDB chat-history  → query the last 6 messages for user_id
   ├── OpenAI client.responses.create(...)   ← openai_response_time_ms measured here
   └── DynamoDB chat-history  → put the user message + AI reply
```

## Repository layout

```
lambda/lambda_function.py   Lambda handler
layer/openai-layer.zip      Lambda layer (openai SDK for python3.12 x86_64)
layer/build_layer.sh        script that builds the layer ZIP
layers.txt                  how the layer was created and attached
frontend/                   React (Vite) app; Function URL is in frontend/src/config.js
screenshots/                test evidence
```

## Lambda function: `open-ai-chatbot`

- **Runtime:** Python 3.12 (x86_64). **Execution role:** `LabRole`. **Timeout:** 30 s. **Memory:** 256 MB.
- **Layer:** `openai-python312` (see [layers.txt](layers.txt)).
- **Environment variables:**
  - `OPENAI_API_KEY`: set in the Lambda console only, never committed
  - `OPENAI_MODEL` = `gpt-4o-mini`
  - `TABLE_NAME` = `chat-history`

**API contract**

| Method | Behaviour |
|---|---|
| `POST` | Body `{"user_prompt": "...", "user_id": "..."}`. Returns `200 {"ai_reply": "...", "openai_response_time_ms": 1234.56}`. |
| `OPTIONS` | CORS preflight, answered by the Function URL itself (never reaches the code). |
| anything else | `405 {"error": "Method GET not allowed. Use POST."}` |

- A missing `user_prompt` returns `400`. An OpenAI or DynamoDB failure returns `500` with a JSON error.
- CORS is configured on the Function URL (Allow origin `*`, Allow methods `POST`, Allow headers `content-type`). AWS adds the `Access-Control-*` headers, so the code sets none; setting them in both places duplicates `Access-Control-Allow-Origin` and the browser rejects the response.
- The console Test event has no `requestContext`, so a missing HTTP method is treated as `POST`. That lets the Task 3 event work as-is.
- `user_id` is optional and defaults to `"anonymous"`. The web UI sends a random UUID that it keeps in `localStorage`, so every browser gets its own history.

**Test event (Task 3)**

```json
{ "body": "{\"user_prompt\": \"Who are you?\"}" }
```

**curl examples (Task 4)**

```bash
URL=https://kchz5of665zqvvjk3voujswyq40blldm.lambda-url.us-east-1.on.aws/
curl -X POST "$URL" -H 'Content-Type: application/json' -d '{"user_prompt":"Who are you?"}'   # 200
curl -i "$URL"                                                                               # 405
curl -i -X OPTIONS "$URL" -H 'Origin: https://main.d3jq7crkpzupwr.amplifyapp.com' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type'   # 200 + CORS headers
```

## DynamoDB table: `chat-history`

| Attribute | Type | Role |
|---|---|---|
| `user_id` | String | **Partition key**, identifies the conversation (one per browser) |
| `timestamp` | Number | **Sort key**, epoch milliseconds. The assistant reply is stored at `user_ts + 1` so it always sorts right after its prompt. |
| `role` | String | `user` or `assistant` |
| `content` | String | message text |

- **Capacity:** on-demand (`PAY_PER_REQUEST`).
- **Reading history:** `Query user_id = :id`, with `ScanIndexForward=false` and `Limit=6` (the newest 6 messages). The result is reversed into chronological order and passed to OpenAI as the `input` list, followed by the new user message.
- **Writing:** after OpenAI replies, the user message and the assistant reply are both written with a batch write.

## Frontend (React + Vite + Chart.js)

- `frontend/src/App.jsx` sends the request and measures the total request time with `performance.now()` around `fetch`.
- `frontend/src/components/Chat.jsx` shows the chat history on the page.
  - The header shows the current session id.
  - **+ New chat** generates a new `user_id` and clears the page. The next request then starts with empty DynamoDB history, and the old conversation stays in the table under its old id.
  - Refreshing the page keeps the same `user_id`, so the bot still remembers the conversation.
- `frontend/src/components/ResponseTimeChart.jsx` draws a line chart of *Total Request Time* against *OpenAI API Time* for each request, in ms. It shows the average of each above the chart and updates after every request. The measurements live only in browser state (they are not stored in DynamoDB).
- `frontend/src/config.js` holds the Function URL.

**Run locally and deploy**

```bash
cd frontend
npm install
npm run dev        # local dev server
npm run build      # output in frontend/dist
```

The site was deployed to Amplify by manual deployment. The contents of `dist/` were zipped, then deployed with `aws amplify create-deployment` and `start-deployment` on the `main` branch of the app `serverless-chatbot`. `frontend/deploy_amplify.sh` does the build and deploy in one step.

## Screenshots

- [`screenshots/lambda-test.png`](screenshots/lambda-test.png): Lambda console Test tab response
- [`screenshots/chatbot-amplify.png`](screenshots/chatbot-amplify.png): the chatbot on Amplify, showing that it remembers history, plus the response-time chart
