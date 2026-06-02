const styles = {
  card: `
    display: inline-block;
    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
    border-left: 4px solid #6c757d;
    border-radius: 8px;
    padding: 12px 16px;
    margin: 8px 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: #212529;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  `,
  link: `
    color: #0969da;
    text-decoration: none;
    font-weight: 600;
    background: rgba(9, 105, 218, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
  `,
  userLink: `
    color: #8250df;
    text-decoration: none;
    font-weight: 500;
    background: rgba(130, 80, 223, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
  `,
  externalUserLink: `
    color: #57606a;
    text-decoration: none;
    font-weight: 500;
    background: rgba(87, 96, 106, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
  `,
  badge: `
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    margin-left: 8px;
  `,
  branchBadge: `
    background: #ddf4ff;
    color: #0969da;
    padding: 2px 8px;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 12px;
  `,
  commitBadge: `
    background: #fff8c5;
    color: #9a6700;
    padding: 2px 8px;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 12px;
  `,
  icon: `
    font-size: 16px;
    margin-right: 8px;
  `,
  timestamp: `
    color: #57606a;
    font-size: 12px;
    margin-top: 8px;
    display: block;
  `,
}

const cardColors = {
  created: '#2da44e',
  merged: '#8250df',
  closed: '#cf222e',
  reopened: '#bf8700',
  review: '#0969da',
  approved: '#2da44e',
  changes: '#bf8700',
  comment: '#57606a',
  mention: '#8250df',
  info: '#6c757d',
}

const createCard = (color, icon, content) =>
  `
<div style="${styles.card} border-left-color: ${color};">
  <span style="${styles.icon}">${icon}</span>
  ${content}
</div>
`
    .trim()
    .replace(/\n\s+/g, ' ')

const createPRLink = (fullRepoName, pullNumber, repoName, reducedBaseBranchName) =>
  `
<a href="https://github.com/${fullRepoName}/pull/${pullNumber}" 
   target="_blank" 
   style="${styles.link}"
   title="${fullRepoName}#${pullNumber}">
  ${repoName}#${pullNumber}
</a>
<span style="${styles.branchBadge}">${reducedBaseBranchName}</span>
`
    .trim()
    .replace(/\n\s+/g, ' ')

const createUserLink = (serverUser, serverFullName, serverDefaultSitename) =>
  `
<a href="/portal/${serverDefaultSitename}/profile/${serverUser}" 
   target="_self" 
   rel="noopener" 
   style="${styles.userLink}">
  ${serverFullName}
</a>
`
    .trim()
    .replace(/\n\s+/g, ' ')

const createExternalUserLink = (githubUser) =>
  `
<a href="https://github.com/${githubUser}" 
   target="_blank" 
   rel="noopener" 
   style="${styles.externalUserLink}">
  👾 ${githubUser}
</a>
`
    .trim()
    .replace(/\n\s+/g, ' ')

const createCommitLink = (fullRepoName, sha, shortSha) =>
  `
<a href="https://github.com/${fullRepoName}/commit/${sha}" 
   target="_blank" 
   style="${styles.commitBadge}">
  ${shortSha}
</a>
`
    .trim()
    .replace(/\n\s+/g, ' ')

const createBranchLink = (fullRepoName, branchName) =>
  `
<a href="https://github.com/${fullRepoName}/tree/${branchName}" 
   target="_blank" 
   style="${styles.branchBadge}">
  ${branchName}
</a>
`
    .trim()
    .replace(/\n\s+/g, ' ')

const createEventLink = (url, text, color = '#0969da') =>
  `
<a href="${url}" 
   target="_blank" 
   style="color: ${color}; text-decoration: none; font-weight: 600;">
  ${text}
</a>
`
    .trim()
    .replace(/\n\s+/g, ' ')

const createMergeableBadge = () =>
  `
<span style="${styles.badge} background: #d1f7c4; color: #1e7e34;">
  ✅ Ready to merge
</span>
`
    .trim()
    .replace(/\n\s+/g, ' ')

export {
  styles,
  cardColors,
  createCard,
  createPRLink,
  createUserLink,
  createExternalUserLink,
  createCommitLink,
  createBranchLink,
  createEventLink,
  createMergeableBadge,
}
