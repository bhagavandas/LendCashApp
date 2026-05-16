// src/components/InterestCalculator.js
import React, { useState } from "react";

function InterestCalculator() {
  const [principal, setPrincipal] = useState(0);
  const [rate, setRate] = useState(0);
  const [months, setMonths] = useState(0);
  const [payment, setPayment] = useState(null);

  const calculate = () => {
    const monthlyRate = rate / 12 / 100;
    const result =
      principal *
      (monthlyRate * Math.pow(1 + monthlyRate, months)) /
      (Math.pow(1 + monthlyRate, months) - 1);
    setPayment(result.toFixed(2));
  };

  return (
    <div>
      <input type="number" placeholder="Principal" onChange={(e) => setPrincipal(+e.target.value)} />
      <input type="number" placeholder="Rate (%)" onChange={(e) => setRate(+e.target.value)} />
      <input type="number" placeholder="Months" onChange={(e) => setMonths(+e.target.value)} />
      <button onClick={calculate}>Calculate</button>
      {payment && <p>Monthly Payment: ₹{payment}</p>}
    </div>
  );
}

export default InterestCalculator;
