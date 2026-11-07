import { useEffect, useState } from "react";
import { apiBaseUrl } from "../services/apiClient.js";

export function useApiHealth() {
  const [state, setState] = useState("checking");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiBaseUrl}/api/health`, { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        const result = await response.json();
        setState(result.database === "connected" ? "connected" : "unavailable");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setState("unavailable");
      });
    return () => controller.abort();
  }, []);

  return state;
}
