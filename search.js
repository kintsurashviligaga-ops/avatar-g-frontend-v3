const cp = require('child_process'); console.log(cp.execSync('git grep -i "?????"').toString());
