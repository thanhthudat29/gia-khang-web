// ponytail: Cloudflare Pages Function to dispatch GitHub Actions workflow without exposing token.
export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const url = (body.url || "").trim();

    if (!url || !url.startsWith("http")) {
      return new Response(JSON.stringify({ error: "Link không hợp lệ!" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const repo = env.GITHUB_REPO || "thanhthudat29/gia-khang-web";
    const token = env.GITHUB_TOKEN;

    if (!token) {
      return new Response(JSON.stringify({ error: "Chưa cấu hình GITHUB_TOKEN trên Cloudflare!" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Generate safe alphanumeric job ID
    const jobId = "gk_" + Date.now().toString(36);

    const ghResp = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/convert.yml/dispatches`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/vnd.github+json",
          "User-Agent": "GiaKhang-Web-Converter",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            url: url,
            job_id: jobId,
          },
        }),
      }
    );

    if (!ghResp.ok) {
      const errText = await ghResp.text();
      return new Response(JSON.stringify({ error: `GitHub API error (${ghResp.status}): ${errText}` }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, job_id: jobId }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
