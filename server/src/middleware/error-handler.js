import { AppError } from "../errors/app-error.js";

export function notFoundHandler(request, _response, next) {
  next(
    new AppError(
      404,
      "ROUTE_NOT_FOUND",
      `No route matches ${request.method} ${request.path}`,
    ),
  );
}

export function errorHandler(error, request, response, _next) {
  if (error instanceof AppError) {
    const body = {
      error: {
        code: error.code,
        message: error.message,
        requestId: request.requestId,
      },
    };
    if (error.details !== undefined) body.error.details = error.details;
    return response.status(error.status).json(body);
  }

  if (error?.type === "entity.parse.failed") {
    return response.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Request body must contain valid JSON",
        requestId: request.requestId,
      },
    });
  }
  if (error?.type === "entity.too.large") {
    return response.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body exceeds the allowed size",
        requestId: request.requestId,
      },
    });
  }

  console.error("Unhandled request error", {
    requestId: request.requestId,
    name: error?.name,
    message: error?.message,
  });
  return response.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
      requestId: request.requestId,
    },
  });
}
