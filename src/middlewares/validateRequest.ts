import { NextFunction, Request, Response } from "express";
import { ParamsDictionary } from "express-serve-static-core";
import { ParsedQs } from "qs";
import { ZodError, ZodObject, ZodTypeAny } from "zod";

export function validateRequest(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schema instanceof ZodObject) {
        const hasEnvelopeShape =
          "shape" in schema &&
          typeof schema.shape === "object" &&
          schema.shape !== null &&
          ("body" in schema.shape || "query" in schema.shape || "params" in schema.shape);

        if (hasEnvelopeShape) {
          const parsed = schema.parse({
            body: req.body,
            query: req.query,
            params: req.params
          }) as {
            body?: Request["body"];
            query?: ParsedQs;
            params?: ParamsDictionary;
          };

          if (parsed.body !== undefined) req.body = parsed.body;
          if (parsed.query !== undefined) {
            Object.defineProperty(req, "query", {
              value: parsed.query,
              configurable: true,
              enumerable: true,
              writable: true
            });
          }
          if (parsed.params !== undefined) req.params = parsed.params;
          next();
          return;
        }

        req.body = schema.parse(req.body);
        next();
        return;
      }

      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: "Validation failed", issues: error.issues });
        return;
      }
      next(error);
    }
  };
}
