import React from "react";
import ReactDOM from "react-dom/client";
import SideQuest from "./SideQuest.jsx";

/*
  window.storage shim
  -------------------
  The SideQuest component uses `window.storage` for deck persistence. That API
  exists inside the Claude artifact sandbox but NOT in a normal browser, so we
  provide a localStorage-backed equivalent here. Same method shapes the
  component expects: get/set/delete/list, each returning a Promise.

  When you move persistence to a real backend (per the backend spec), you can
  delete this shim and swap the calls in SideQuest.jsx for fetch() to your API.
*/
if (typeof window !== "undefined" && !window.storage) {
  const PREFIX = "sidequest:";
  window.storage = {
    async get(key) {
      const v = localStorage.getItem(PREFIX + key);
      return v === null ? null : { key, value: v };
    },
    async set(key, value) {
      localStorage.setItem(PREFIX + key, value);
      return { key, value };
    },
    async delete(key) {
      localStorage.removeItem(PREFIX + key);
      return { key, deleted: true };
    },
    async list(prefix = "") {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX + prefix)) keys.push(k.slice(PREFIX.length));
      }
      return { keys, prefix };
    },
  };
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SideQuest />
  </React.StrictMode>
);
