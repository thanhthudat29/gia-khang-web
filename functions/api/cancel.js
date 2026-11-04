export async function onRequestPost({ request, env }) {
  try {
    const repo = env.GITHUB_REPO || "thanhthudat29/gia-khang-web";
    const token = env.GITHUB_TOKEN;

    if (!token) {
      return new Response(JSON.stringify({ error: "Chưa cấu hình GITHUB_TOKEN" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const headers = {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "GiaKhang-Web-Converter",
    };

    const runsResp = await fetch(
      `https://api.github.com/repos/${repo}/actions/runs?per_page=10`,
      { headers }
    );

    const cancelledRuns = [];
    if (runsResp.ok) {
      const runsData = await runsResp.json();
      for (const run of runsData.workflow_runs || []) {
        const isTarget = run.name === "Build Assets" || (run.path && run.path.includes("convert.yml"));
        const isActive = run.status === "in_progress" || run.status === "queued" || run.status === "waiting";
        if (isTarget && isActive) {
          const cResp = await fetch(
            `https://api.github.com/repos/${repo}/actions/runs/${run.id}/cancel`,
            {
              method: "POST",
              headers,
            }
          );
          if (cResp.ok || cResp.status === 202) {
            cancelledRuns.push(run.id);
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, cancelled: cancelledRuns }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
