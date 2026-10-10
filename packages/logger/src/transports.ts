import { destination, type DestinationStream } from "pino";

export function createDefaultDestination(): DestinationStream {
  const isProduction = process.env["NODE_ENV"] === "production";

  if (isProduction) {
    // Non-blocking SonicBoom asynchronous destination stream in production Docker container
    return destination({
      dest: 1,
      minLength: 4096,
      sync: false,
    });
  }

  // In test or development, synchronous stdout stream
  return destination({
    dest: 1,
    sync: true,
  });
}
