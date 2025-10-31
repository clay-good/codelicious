# Pre-Publish Checklist for Codelicious

**Version:** 1.0.0  
**Target:** VS Code Marketplace & Open VSX Registry  
**Estimated Time:** 1-2 hours

---

## 🔴 Critical (Must Complete)

### 1. Repository Setup

- [ ] **Update package.json repository URLs**
  - Line 10: `"url": "https://github.com/clay-good/codelicious.git"`
  - Line 13: `"url": "https://github.com/clay-good/codelicious/issues"`
  - Line 15: `"url": "https://github.com/clay-good/codelicious#readme"`

- [ ] **Update README.md**
  - Line 98: Update clone URL
  - Line 8: Update badge URLs
  - All references to `clay-good`

- [ ] **Fix src/extension.ts**
  - Line 995: Update URL from `clay-good/reviewr` to correct repo

### 2. Publisher Setup

- [ ] **Create VS Code Marketplace Publisher**
  - Go to https://marketplace.visualstudio.com/manage
  - Create publisher account
  - Note your publisher ID

- [ ] **Update package.json**
  - Line 6: `"publisher": "YOUR_PUBLISHER_ID"`

- [ ] **Create Personal Access Token**
  - Go to https://dev.azure.com
  - Create PAT with Marketplace (Manage) scope
  - Save token securely

### 3. Version Consistency

- [ ] **Verify version is 1.0.0 in:**
  - [ ] package.json (line 5)
  - [ ] package-lock.json (line 3)
  - [ ] README.md (line 124)
  - [ ] CHANGELOG.md (line 9)

### 4. Files Created

- [ ] **Verify these files exist:**
  - [ ] `.vscodeignore` ✅ (created)
  - [ ] `CHANGELOG.md` ✅ (created)
  - [ ] `docs/DEPLOYMENT.md` ✅ (created)
  - [ ] `docs/GAPS_AND_OPTIMIZATIONS.md` ✅ (created)

### 5. Fix Minor Issues

- [ ] **Fix .gitignore typo**
  - Line 1: Remove 'n' from `n# Dependencies`

- [ ] **Update CHANGELOG.md**
  - Replace all `clay-good` placeholders
  - Add your contact information

---

## 🟡 Important (Highly Recommended)

### 6. Testing

- [ ] **Run full test suite**
  ```bash
  npm test
  ```
  - Verify all 1,007 tests pass

- [ ] **Build production bundle**
  ```bash
  npm run build
  ```
  - Check for warnings
  - Verify dist/ folder created

- [ ] **Package extension**
  ```bash
  npx vsce package
  ```
  - Verify .vsix file created
  - Check package size (<50MB)

- [ ] **Test locally**
  ```bash
  code --install-extension codelicious-1.0.0.vsix
  ```
  - Test all major features
  - Check for runtime errors
  - Verify API key configuration works

### 7. Documentation

- [ ] **Review README.md**
  - Check all links work
  - Verify screenshots/GIFs (if any)
  - Ensure installation instructions are clear

- [ ] **Review CHANGELOG.md**
  - Verify release notes are complete
  - Check formatting

- [ ] **Create GitHub Release**
  - Tag: v1.0.0
  - Title: "Codelicious v1.0.0"
  - Description from CHANGELOG.md
  - Attach .vsix file

### 8. Marketplace Preparation

- [ ] **Prepare marketplace assets**
  - [ ] Icon (128x128 PNG recommended)
  - [ ] Screenshots (at least 3)
  - [ ] Demo GIF or video
  - [ ] Feature comparison table

- [ ] **Write compelling description**
  - Highlight key features
  - Include use cases
  - Add installation instructions

---

## 🟢 Optional (Nice to Have)

### 9. Additional Quality Checks

- [ ] **Run linter**
  ```bash
  npm run lint
  ```

- [ ] **Check for security vulnerabilities**
  ```bash
  npm audit
  ```

- [ ] **Review code coverage**
  ```bash
  npm run coverage
  ```

### 10. Marketing Preparation

- [ ] **Create social media posts**
  - Twitter/X announcement
  - LinkedIn post
  - Reddit post (r/vscode, r/programming)

- [ ] **Prepare blog post**
  - Technical overview
  - Use cases
  - Getting started guide

- [ ] **Update personal website/portfolio**
  - Add project to portfolio
  - Link to marketplace

### 11. Community Setup

- [ ] **Enable GitHub Discussions**
  - Create welcome post
  - Set up categories

- [ ] **Create issue templates**
  - Bug report
  - Feature request
  - Question

- [ ] **Add CONTRIBUTING.md**
  - Contribution guidelines
  - Code of conduct
  - Development setup

---

## 📋 Publishing Commands

### VS Code Marketplace

```bash
# Login (first time only)
npx vsce login YOUR_PUBLISHER_ID

# Package
npx vsce package

# Publish
npx vsce publish
```

### Open VSX Registry

```bash
# Install CLI
npm install -g ovsx

# Login
ovsx login YOUR_PUBLISHER_ID -p YOUR_ACCESS_TOKEN

# Publish
ovsx publish codelicious-1.0.0.vsix
```

---

## ✅ Final Verification

Before clicking "Publish":

- [ ] All critical items completed
- [ ] Tests passing
- [ ] Package built successfully
- [ ] Tested locally
- [ ] Documentation reviewed
- [ ] Repository URLs updated
- [ ] Publisher ID set
- [ ] Version consistent
- [ ] CHANGELOG.md complete

---

## 🚀 Post-Publish

After publishing:

- [ ] **Verify marketplace listing**
  - Check all information displays correctly
  - Test installation from marketplace
  - Verify icon and screenshots

- [ ] **Monitor for issues**
  - Watch GitHub issues
  - Check marketplace reviews
  - Monitor error logs

- [ ] **Announce release**
  - Post on social media
  - Share in communities
  - Email newsletter (if applicable)

- [ ] **Update documentation**
  - Add marketplace badge to README
  - Update installation instructions
  - Link to marketplace page

---

## 📞 Support Resources

### If You Get Stuck

1. **VS Code Extension Docs**
   - https://code.visualstudio.com/api

2. **Publishing Guide**
   - https://code.visualstudio.com/api/working-with-extensions/publishing-extension

3. **vsce Documentation**
   - https://github.com/microsoft/vscode-vsce

4. **Community Help**
   - VS Code Discord: https://aka.ms/vscode-dev-community
   - Stack Overflow: [vscode-extensions] tag

---

## 🎯 Success Criteria

Your extension is ready to publish when:

✅ All critical checklist items are complete  
✅ All tests pass  
✅ Package size is reasonable (<50MB)  
✅ Extension works when installed locally  
✅ Documentation is clear and complete  
✅ Repository URLs are correct  
✅ Publisher account is set up  

---

## 📊 Expected Timeline

- **Critical fixes:** 30 minutes
- **Testing:** 30 minutes
- **Documentation review:** 15 minutes
- **Marketplace setup:** 15 minutes
- **Publishing:** 10 minutes
- **Verification:** 10 minutes

**Total:** ~2 hours

---

## 🎉 You're Ready!

Once all critical items are checked, you're ready to publish Codelicious to the world!

Good luck! 🚀

---

**Last Updated:** 2025-10-30  
**Version:** 1.0.0

