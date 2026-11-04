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

    const relResp = await fetch(
      `https://api.github.com/repos/${repo}/releases?per_page=100`,
      { headers }
    );

    let manifest = null;
    const readyFiles = [];
    const prefix = `rel_${jobId}_`;

    if (relResp.ok) {
      const releases = await relResp.json();
      for (const rel of releases) {
        if (rel.draft || !rel.tag_name || rel.tag_name.startsWith("untagged")) {
          continue;
        }

        if (rel.tag_name === `rel_${jobId}_manifest`) {
          try {
            manifest = JSON.parse(rel.body);
          } catch (e) {
            manifest = null;
          }
        } else if (rel.tag_name.startsWith(prefix)) {
          const match = rel.tag_name.match(new RegExp(`^rel_${jobId}_(\\d+)$`));
          const fileIndex = match ? parseInt(match[1], 10) : null;
          for (const asset of rel.assets || []) {
            const isUploaded = !asset.state || asset.state === "uploaded";
            if (asset.name.endsWith(".mp4") && isUploaded) {
              const downloadUrl = `https://github.com/${repo}/releases/download/${rel.tag_name}/${encodeURIComponent(asset.name)}`;
              readyFiles.push({
                id: asset.id,
                index: fileIndex,
                tag: rel.tag_name,
                name: asset.name,
                download_url: downloadUrl,
                size: asset.size,
              });
            }
          }
        }
      }
    }

    readyFiles.sort((a, b) => (a.index || 0) - (b.index || 0));

    let isCompleted = false;
    let runStatus = "queued";
    const runsResp = await fetch(
      `https://api.github.com/repos/${repo}/actions/runs?per_page=20`,
      { headers }
    );

    if (runsResp.ok) {
      const runsData = await runsResp.json();
      for (const run of runsData.workflow_runs || []) {
        const title = run.display_title || run.name || "";
        if (title.includes(jobId)) {
          runStatus = run.status;
          if (run.status === "completed") {
            isCompleted = true;
          }
          break;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        job_id: jobId,
        manifest,
        files: readyFiles,
        is_completed: isCompleted,
        status: runStatus,
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
