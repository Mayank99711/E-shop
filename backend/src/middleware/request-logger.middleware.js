import morgan from "morgan";

// Custom request log format
morgan.token("safe-path", (req) => {
  // Removes query string so tokens and other
  // sensitive query values are not logged.
  return req.path;
});

export const requestLogger = morgan(
  "[API] :method :safe-path :status :response-time ms",
);
