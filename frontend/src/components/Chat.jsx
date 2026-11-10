import { useEffect, useRef, useState } from 'react'

export default function Chat({ messages, loading, onSend, onNewChat, sessionId }) {
  const [input, setInput] = useState('')
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading])

  function handleSubmit(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    onSend(text)
  }

  return (
    <section className="panel chat">
      <div className="chat-header">
        <h2>
          Chat <span className="session" title={sessionId}>session {sessionId.slice(0, 8)}</span>
        </h2>
        <button type="button" className="new-chat" onClick={onNewChat} disabled={loading}>
          + New chat
        </button>
      </div>
      <div className="messages">
        {messages.length === 0 && (
          <p className="empty">Say hello. The bot remembers your last few messages.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            <span className="who">{m.role === 'user' ? 'You' : m.role === 'assistant' ? 'Bot' : '!'}</span>
            <p>{m.content}</p>
          </div>
        ))}
        {loading && (
          <div className="bubble assistant typing">
            <span className="who">Bot</span>
            <p>Thinking…</p>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form className="composer" onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          aria-label="Message"
          autoFocus
        />
        <button type="submit" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </section>
  )
}
