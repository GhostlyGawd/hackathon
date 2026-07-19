export function GET(): Response {
  return Response.json({
    product: "Pactwire",
    service: "web",
    status: "ok",
  });
}
