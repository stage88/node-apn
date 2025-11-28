How to update and release new versions:
1. Branch to new version, for example `rel/v10.7.0`
2. Update version numbers in `package.json`
3. run `npm run update-deps` and run tests
4. Commit and push the branch
5. If not already, create PR against master from upstream
6, Merge from master into the release branch, run tests again, fix issues