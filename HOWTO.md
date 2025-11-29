Merge from upstream (https://github.com/parse-community/node-apn) master before releasing:
1. In Github, navigate to upstream repo, compare the most recent tag (release) with master, review changes on master
2. In Github, create PR from upstream master into local master

Update and release new versions:
1. Branch to new version, for example `rel/v10.7.0`
2. Update version numbers in `package.json` and `package-lock.json`
3. Run rm -rf node_modules and package-lock.json
3. Run `npm run update-deps` and run tests
4. Commit and push the branch
6. Merge from master into the release branch, run tests again, fix issues