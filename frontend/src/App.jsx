import { useState } from 'react'
import { FUNCTION_URL } from './config'
import Chat from './components/Chat'
import ResponseTimeChart from './components/ResponseTimeChart'

const USER_ID_KEY = 'chatbot_user_id'

// Creates a fresh session id and remembers it in this browser
function newUserId() {
  const id = crypto.randomUUID()
  try {
    localStorage.setItem(USER_ID_KEY, id)
  } catch {
    /* storage unavailable: id lives only for this page load */
  }
  return id
}

// A stable id per browser so DynamoDB can keep this user's conversation history
function getUserId() {
  try {
    return localStorage.getItem(USER_ID_KEY) || newUserId()
  } catch {
    return newUserId()
  }
}

export default function App() {
  const [userId, setUserId] = useState(getUserId)
  const [messages, setMessages] = useState([])
  const [timings, setTimings] = useState([]) // [{ total, openai }] in ms, session only
  const [loading, setLoading] = useState(false)

  async function sendMessage(text) {
    setMessages((m) => [...m, { role: 'user', content: text }])
    setLoading(true)

    const start = performance.now()
    try {
      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_prompt: text, user_id: userId }),
      })
      const data = await res.json()
      const total = performance.now() - start // network + Lambda + OpenAI

      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

      setMessages((m) => [...m, { role: 'assistant', content: data.ai_reply }])
      setTimings((t) => [
        ...t,
        { total: Math.round(total), openai: Math.round(data.openai_response_time_ms) },
      ])
    } catch (err) {
      setMessages((m) => [...m, { role: 'error', content: `Error: ${err.message}` }])
    } finally {
      setLoading(false)
    }
  }

  // Start a new conversation: new user_id means DynamoDB history starts empty
  function startNewChat() {
    setUserId(newUserId())
    setMessages([])
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Serverless Chatbot</h1>
        <p>AWS Lambda · OpenAI Responses API · DynamoDB · Amplify</p>
      </header>
      <main className="layout">
        <Chat
          messages={messages}
          loading={loading}
          onSend={sendMessage}
          onNewChat={startNewChat}
          sessionId={userId}
        />
        <ResponseTimeChart timings={timings} />
      </main>
    </div>
  )
}
