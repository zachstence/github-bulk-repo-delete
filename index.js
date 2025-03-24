import "dotenv/config";
import { checkbox, input } from "@inquirer/prompts";
import ora from "ora";
import { Octokit, RequestError } from "octokit";

console.log("\n=-=-= github-bulk-repo-delete =-=-=\n");

let githubPAT = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

if (!githubPAT) {
  githubPAT = await input({
    message: "Enter your GitHub Personal Access Token:",
    validate: (value) => {
      if (!value) return false;
      return true;
    },
  });
}

const octokit = new Octokit({ auth: githubPAT });

const spinner = ora("Fetching your repositories...\n").start();

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

const toDelete = await checkbox({
  message: "Select repositories to delete",
  choices: reposResponse.map((repo) => ({
    name: repo.full_name,
    value: repo.full_name,
  })),
  pageSize: 20,
});

console.log(
  `Are you sure you want to delete the following ${toDelete.length} repositories?`
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
