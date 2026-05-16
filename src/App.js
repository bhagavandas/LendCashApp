import React from "react";
import { Analytics } from "@vercel/analytics/react";
import LenderForm from "./components/LenderForm";

function App() {
  return (
    <div>
      <h1>Lending App</h1>
      <LenderForm />
      <Analytics />
    </div>
  );
}

export default App;
