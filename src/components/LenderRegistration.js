// src/components/LenderRegistration.js
import React, { useState } from "react";
import { getDatabase, ref, set } from "firebase/database";

function LenderRegistration() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const db = getDatabase();
    set(ref(db, "lenders/" + Date.now()), { name, email });
    alert("Lender registered successfully!");
  };

  return (
    <form onSubmit={handleSubmit}>
      <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit">Register</button>
    </form>
  );
}

export default LenderRegistration;
