import { useCallback, useState } from "react"
import reactLogo from "./assets/react.svg"
import viteLogo from "/vite.svg"
import "./App.css"

function App() {
  const [input, setInput] = useState("")
  const [res, setRes] = useState("")

  const submit = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      params.set("url", input)
      setRes(await fetch(`/api/me?${params.toString()}`).then(res => res.text()))
    } catch (e: unknown) {
      // @ts-expect-error xxx
      setRes(e.message)
    }
  }, [input])

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "10px",
    }}
    >
      <div>
        <a href="https://vitejs.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <div style={{
        display: "flex",
        gap: "10px",
      }}
      >
        <input
          type="text"
          style={{
            width: "300px",
          }}
          value={input}
          onInput={e => setInput(e.currentTarget.value)}
        />
        <button
          type="button"
          onClick={submit}
          style={{
            height: "30px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          disabled={!input.startsWith("https://")}
        >
          提交
        </button>
      </div>
      <div>
        <textarea
          value={res}
          style={{
            width: "380px",
            height: 100,
          }}
          disabled
        >
        </textarea>
      </div>
    </div>
  )
}

export default App
