import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

export default function Callback() {
  const navigate = useNavigate();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const state = urlParams.get("state"); // Used to determine provider

    if (code && state) {
      const provider = state; // e.g., 'quickbooks' or 'xero'

      axios
        .post("http://localhost:5000/api/exchange-token", {
          code,
          provider,
        })
        .then(() => {
          alert(`${provider} connected successfully!`);
          navigate("/");
        })
        .catch((err) => {
          console.error("Token exchange failed:", err);
          alert("Failed to connect with " + provider);
        });
    } else {
      alert("Missing code or state in callback URL.");
    }
  }, [navigate]);

  return <div className="p-4 text-center">Connecting...</div>;
}
