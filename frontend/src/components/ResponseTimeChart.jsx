import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

const TOTAL_COLOR = '#2563eb'
const OPENAI_COLOR = '#f97316'

const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0)

export default function ResponseTimeChart({ timings }) {
  const totals = timings.map((t) => t.total)
  const openais = timings.map((t) => t.openai)

  const data = {
    labels: timings.map((_, i) => `#${i + 1}`),
    datasets: [
      {
        label: 'Total Request Time (ms)',
        data: totals,
        borderColor: TOTAL_COLOR,
        backgroundColor: TOTAL_COLOR,
        tension: 0.25,
      },
      {
        label: 'OpenAI API Time (ms)',
        data: openais,
        borderColor: OPENAI_COLOR,
        backgroundColor: OPENAI_COLOR,
        tension: 0.25,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom' },
      tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y} ms` } },
    },
    scales: {
      x: { title: { display: true, text: 'Request' } },
      y: { beginAtZero: true, title: { display: true, text: 'Time (ms)' } },
    },
  }

  return (
    <section className="panel metrics">
      <h2>Response Times</h2>
      <div className="stats">
        <div className="stat">
          <span className="dot" style={{ background: TOTAL_COLOR }} />
          <span className="label">Avg total request</span>
          <strong>{avg(totals)} ms</strong>
        </div>
        <div className="stat">
          <span className="dot" style={{ background: OPENAI_COLOR }} />
          <span className="label">Avg OpenAI API</span>
          <strong>{avg(openais)} ms</strong>
        </div>
        <div className="stat">
          <span className="label">Requests</span>
          <strong>{timings.length}</strong>
        </div>
      </div>
      <div className="chart-box">
        {timings.length ? (
          <Line data={data} options={options} />
        ) : (
          <p className="empty">Send a message to start measuring.</p>
        )}
      </div>
    </section>
  )
}
