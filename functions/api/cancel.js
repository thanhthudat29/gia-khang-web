export async function onRequestPost({ request, env }) {
  try {
    const repo = env.GITHUB_REPO || "thanhthudat29/gia-khang-web";
    const token = env.GITHUB_TOKEN;

    const headers = {
      "Accept": "application/vnd.github+json",
      "User-Agent": "GiaKhang-Web-Converter",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const runsResp = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/convert.yml/runs?status=in_progress`,
      { headers }
    );

    if (runsResp.ok) {
      const runsData = await runsResp.json();
      for (const run of runsData.workflow_runs || []) {
        await fetch(
          `https://api.github.com/repos/${repo}/actions/runs/${run.id}/cancel`,
          {
            method: "POST",
            headers,
          }
        );
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
