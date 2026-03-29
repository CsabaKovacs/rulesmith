import { useNavigate } from "react-router-dom";

import { SessionService } from "./services/session-service";

export function App() {
  const navigate = useNavigate();

  async function finishLogin() {
    try {
      await SessionService.instance.finishLogin();
      navigate("/dashboard");
    } catch (error) {
      if (error instanceof AuthError) {
        return;
      }
      throw error;
    }
  }

  return <button onClick={() => void finishLogin()}>Hello React</button>;
}

class AuthError extends Error {}
