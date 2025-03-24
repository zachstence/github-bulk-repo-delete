import "dotenv/config";
import { checkbox, input } from "@inquirer/prompts";
import ora from "ora";
import { Octokit, RequestError } from "octokit";

console.log("\n=-=-= github-bulk-repo-delete =-=-=\n");

console.log(
  "⚠  By using this tool, you acknowledge and agree that you are solely responsible for the repositories you choose to delete. The developer accepts no responsibility for any data loss or damage that may occur. Use this tool at your own risk."
);
await input({
  message: `Type "agree" to continue`,
  validate: (value) => value.toLowerCase() === "agree",
});

let githubPAT = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

console.log();

if (githubPAT) {
  console.log("Using GitHub Personal Access Token from environment variable");
} else {
  githubPAT = await input({
    message: "Enter your GitHub Personal Access Token:",
    validate: (value) => {
      if (!value) return false;
      return true;
    },
  });
}

console.log();

const spinner = ora("Fetching your repositories...").start();

const octokit = new Octokit({ auth: githubPAT });

const reposResponse = await octokit
  .paginate(octokit.rest.repos.listForAuthenticatedUser, {
    per_page: 100,
  })
  .catch((e) => {
    if (e instanceof RequestError) {
      console.error(
        `Failed to fetch your repositories\n${e.status} ${e.message}`
      );
    } else {
      console.error("Unexpected error\n", e);
    }
    process.exit(1);
  });

spinner.succeed();

console.log();

const toDelete = await checkbox({
  message: "Select repositories to delete",
  choices: reposResponse.map((repo) => ({
    name: repo.full_name,
    value: repo.full_name,
  })),
  pageSize: 20,
  validate: (value) => {
    if (value.length === 0) return "Select at least one repository";
    return true;
  },
});

console.log(
  `\nAre you sure you want to delete the following ${toDelete.length} repositories?`
);
console.log(toDelete.join("\n"));

const confirmation = `Delete ${toDelete.length} repositories`;
await input({
  message: `Type "${confirmation}" to continue`,
  validate: (value) => value.toLowerCase() === confirmation.toLowerCase(),
});

/** @type {Record<string, import("ora").Ora>} */
const spinners = Object.fromEntries(
  toDelete.map((repoFullName) => [repoFullName, ora(repoFullName).start()])
);

const promises = toDelete.map(async (repoFullName) => {
  const [owner, repo] = repoFullName.split("/");
  try {
    await octokit.rest.repos.delete({ owner, repo });
    spinners[repoFullName].succeed();
  } catch (e) {
    if (e instanceof RequestError) {
      spinners[repoFullName].fail(
        `Failed to delete repository\n${e.status} ${e.message}`
      );
    } else {
      spinners[repoFullName].fail("Unexpected error\n", e);
    }
  }
});

await Promise.all(promises);

console.log("\nFinished");
