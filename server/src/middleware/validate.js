import { AppError } from "../errors/app-error.js";

export function validate(schema, target = "body") {
  return (request, _response, next) => {
    const result = schema.safeParse(request[target]);
    if (!result.success) {
      return next(
        new AppError(
          400,
          "VALIDATION_ERROR",
          "Request validation failed",
          result.error.flatten(),
        ),
      );
    }

    request[target] = result.data;
    return next();
  };
}
