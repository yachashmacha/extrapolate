export function bookSearch(input: {
  demo: boolean;
  source: string | null;
  address: string;
  terminal: string;
  depth: string;
}): string {
  const query = new URLSearchParams();
  if (input.demo) query.set("demo", "1");
  else if (input.source === "csv") query.set("source", "csv");
  else if (input.address) query.set("address", input.address);
  query.set("terminal", input.terminal);
  if (input.depth && input.depth !== "200") query.set("depth", input.depth);
  const text = query.toString();
  return text ? `?${text}` : "";
}
