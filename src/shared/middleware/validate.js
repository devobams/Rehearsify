import { ZodError } from "zod";

/**
 * Validates request data against a Zod schema.
 * @param {import('zod').ZodSchema} schema 
 * @param {'body' | 'query' | 'params'} target - Defaults to 'body'
 */
export default function validate(schema, target = 'body') {
  return (req, res, next) => {
    try {
      const parsedData = schema.parse(req[target]);
      if (target === 'query') {
        Object.defineProperty(req, 'query', {
          value: parsedData,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      } else {
        req[target] = parsedData;
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: {
            message: "Validation failed",
            details: err.issues.map(issue => ({
              field: issue.path.join("."),
              message: issue.message
            }))
          }
        });
      }

      next(err);
    }
  };
}