// ponytail: Cloudflare Pages Function polling releases and workflow runs.
export async function onRequestGet({ request, env }) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("job_id");

    if (!jobId) {
      return new Response(JSON.stringify({ error: "Thiếu job_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const repo = env.GITHUB_REPO || "thanhthudat29/gia-khang-web";
    const token = env.GITHUB_TOKEN;

    const headers = {
      "Accept": "application/vnd.github+json",
      "User-Agent": "GiaKhang-Web-Converter",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // 1. Fetch releases matching this job
    const relResp = await fetch(
      `https://api.github.com/repos/${repo}/releases?per_page=100`,
      { headers }
    );

    const readyFiles = [];
    if (relResp.ok) {
      const releases = await relResp.json();
      const prefix = `rel_${jobId}_`;
      for (const rel of releases) {
        if (rel.tag_name && rel.tag_name.startsWith(prefix)) {
          for (const asset of rel.assets || []) {
            if (asset.name.endsWith(".mp4")) {
              readyFiles.push({
                id: asset.id,
                tag: rel.tag_name,
                name: asset.name,
                download_url: asset.browser_download_url,
                size: asset.size,
              });
            }
          }
        }
      }
    }

    // Sort ready files by name
    readyFiles.sort((a, b) => a.name.localeCompare(b.name));

    // 2. Fetch latest workflow run to check if still running
    let isCompleted = false;
    let runStatus = "queued";
    const runsResp = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/convert.yml/runs?per_page=5`,
      { headers }
    );

    if (runsResp.ok) {
      const runsData = await runsResp.json();
      const latestRun = (runsData.workflow_runs || [])[0];
      if (latestRun) {
        runStatus = latestRun.status; // queued, in_progress, completed
        if (latestRun.status === "completed") {
          isCompleted = true;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        job_id: jobId,
        status: runStatus,
        is_completed: isCompleted,
        files: readyFiles,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
