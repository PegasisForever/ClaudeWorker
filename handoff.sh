#! /bin/bash

echo job started

args=("$@")
DIR=${args[0]}
BRANCH=${args[1]}
INSTRUCTIONS=${args[2]}

tmux send-keys -t claude "cd ~/${DIR}" Enter

PROMPT="
1. discard all local git changes, pull latest and switch to ${BRANCH}
2. create and switch to a new branch on top of ${BRANCH}, the new branch name is \`${BRANCH}-<change-description>\`
3. set up the repo using the \"setup-repo\" skill (nuke the db if needed, don't ask for permissions)
4. implement the instructions as best as you can. treat the instructions as a preliminary draft. you dont need to follow the instruction strictly if it conflicts with your discovery. do not stop until every requirement in the instruction is satisfied.
5. if frontend changes: create a detailed test plan for frontend, and validate changes with computer use and devtools mcp, fix console / layout issues
6. if the change is ui related, record a video of the changed portion of the ui (use screen-record skill)
7. create a pr on github using the gh cli, with the 5x sped up video, prefix pr title with \`[PEGA-TMP]\` (for the test plan section, make sure you already tested everything yourself, and make sure all the boxes are already checked)
8. ping me on discord (use discord-notify skill), with a summary of what is changed, link to the pr and the 5x sped up video as attachment
9. leave the dev server and browser running so i can come check

The following are the instructions to complete:

${INSTRUCTIONS}
"

COMMAND="claude --dangerously-skip-permissions --allow-dangerously-skip-permissions --effort high $(printf '%q' "$PROMPT")"

tmux send-keys -t claude "${COMMAND}" Enter Enter