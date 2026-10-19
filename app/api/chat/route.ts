import { answer } from "@/lib/rag";

export async function POST(req: Request) {
  try {
    const { question } = await req.json();
    if (typeof question !== "string" || question.trim().length === 0) {
      return Response.json({ error: "question is required" }, { status: 400 });
    }

    return Response.json(await answer(question));
  } catch (error) {
    console.error("Chat failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Chat failed" },
      { status: 500 },
    );
  }
}
