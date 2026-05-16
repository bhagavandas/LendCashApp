// src/components/PhoneLogin.js
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import React, { useState } from "react";

function PhoneLogin() {
  const auth = getAuth();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");

  const sendOTP = () => {
    window.recaptchaVerifier = new RecaptchaVerifier("recaptcha-container", {}, auth);
    signInWithPhoneNumber(auth, phone, window.recaptchaVerifier)
      .then((confirmationResult) => {
        window.confirmationResult = confirmationResult;
        alert("OTP sent!");
      });
  };

  const verifyOTP = () => {
    window.confirmationResult.confirm(otp).then(() => {
      alert("Phone login successful!");
    });
  };

  return (
    <div>
      <div id="recaptcha-container"></div>
      <input placeholder="Phone Number" onChange={(e) => setPhone(e.target.value)} />
      <button onClick={sendOTP}>Send OTP</button>
      <input placeholder="Enter OTP" onChange={(e) => setOtp(e.target.value)} />
      <button onClick={verifyOTP}>Verify OTP</button>
    </div>
  );
}

export default PhoneLogin;
