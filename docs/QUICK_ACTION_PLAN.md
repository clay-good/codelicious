# Codelicious - Quick Action Plan

**Goal:** Publish to VS Code Marketplace  
**Time Required:** 1-2 hours  
**Difficulty:** Easy

---

## 🎯 The 7 Critical Fixes (30 minutes)

### Fix #1: Update Repository URLs (5 minutes)

**Files to edit:**

1. **package.json** - Lines 10, 13, 15
   ```json
   "url": "https://github.com/clay-good/codelicious.git"
   ```

2. **README.md** - Line 98 and badge URLs
   ```bash
   git clone https://github.com/clay-good/codelicious.git
   ```

3. **src/extension.ts** - Line 995
   ```typescript
   vscode.env.openExternal(vscode.Uri.parse('https://github.com/clay-good/codelicious'));
   ```
   ⚠️ **IMPORTANT:** Currently points to wrong repo: `clay-good/reviewr`

4. **CHANGELOG.md** - Multiple lines
   - Replace all `clay-good` with your GitHub username
   - Update contact information at bottom

**Command to find all instances:**
```bash
grep -r "clay-good" .
grep -r "clay-good/reviewr" .
```

---

### Fix #2: Create Publisher Account (10 minutes)

**Steps:**

1. **Go to VS Code Marketplace**
   - Visit: https://marketplace.visualstudio.com/manage
   - Sign in with Microsoft account

2. **Create Publisher**
   - Click "Create Publisher"
   - Choose publisher ID (lowercase, no spaces)
   - Examples: `clay-good`, `codelicious-ai`, `your-name`
   - Fill in display name and description

3. **Create Personal Access Token**
   - Go to: https://dev.azure.com
   - Click user icon → Personal Access Tokens
   - Click "New Token"
   - Name: "VS Code Marketplace"
   - Organization: All accessible organizations
   - Scopes: **Marketplace (Manage)**
   - Expiration: 1 year
   - **SAVE THE TOKEN SECURELY!**

4. **Update package.json**
   - Line 6: `"publisher": "YOUR_PUBLISHER_ID"`

---

### Fix #3: Fix Version Inconsistency (2 minutes)

**File:** README.md - Line 124

**Change from:**
```bash
code --install-extension ./codelicious-0.1.0.vsix
```

**Change to:**
```bash
code --install-extension ./codelicious-1.0.0.vsix
```

---

### Fix #4: Fix .gitignore Typo (1 minute)

**File:** .gitignore - Line 1

**Change from:**
```
n# Dependencies
```

**Change to:**
```
# Dependencies
```

---

### Fix #5: Verify Files Created (1 minute)

**Check these files exist:**
```bash
ls -la .vscodeignore
ls -la CHANGELOG.md
ls -la docs/DEPLOYMENT.md
ls -la docs/GAPS_AND_OPTIMIZATIONS.md
ls -la docs/PRE_PUBLISH_CHECKLIST.md
ls -la docs/DEPLOYMENT_SUMMARY.md
```

All should exist ✅

---

### Fix #6: Update Contact Info (5 minutes)

**File:** CHANGELOG.md - Bottom section

**Update:**
```markdown
## Contact

- **Author:** Clay Good
- **Email:** your-email@example.com
- **GitHub:** @clay-good
- **Twitter:** @yourhandle (optional)
```

---

### Fix #7: Final Review (5 minutes)

**Quick checklist:**
- [ ] All URLs updated
- [ ] Publisher ID set
- [ ] Version consistent (1.0.0)
- [ ] .gitignore fixed
- [ ] Contact info updated
- [ ] All files exist

---

## 🧪 Testing Phase (30 minutes)

### Step 1: Run Tests (5 minutes)

```bash
npm test
```

**Expected:** All 1,007 tests pass

**If tests fail:**
- Check error messages
- Fix any issues
- Re-run tests

---

### Step 2: Build Production Bundle (5 minutes)

```bash
# Clean previous builds
rm -rf dist/ out/ *.vsix

# Install dependencies (if needed)
npm install

# Build
npm run build
```

**Expected:** `dist/extension.js` created

**Check for:**
- No build errors
- No TypeScript errors
- Webpack bundle created

---

### Step 3: Package Extension (5 minutes)

```bash
# Install vsce (if not installed)
npm install -g @vscode/vsce

# Package
npx vsce package
```

**Expected:** `codelicious-1.0.0.vsix` created

**Check:**
- Package size (<50MB, ideally <30MB)
- No warnings about missing files
- .vscodeignore is working (check output)

**If package is too large:**
- Verify .vscodeignore exists
- Check what's included: `npx vsce ls`

---

### Step 4: Test Locally (15 minutes)

```bash
# Install extension
code --install-extension codelicious-1.0.0.vsix
```

**Test these features:**

1. **Extension Activates**
   - Open VS Code
   - Check extension is active
   - No errors in console (Help → Toggle Developer Tools)

2. **API Key Configuration**
   - Run command: "Codelicious: Configure API Keys"
   - Add a test API key
   - Verify it's saved

3. **Chat Interface**
   - Open Codelicious chat
   - Send a test message
   - Verify response

4. **Code Completion**
   - Open a code file
   - Type some code
   - Check for inline suggestions

5. **Context Panel**
   - Open context panel
   - Verify it displays

**If any issues:**
- Check console for errors
- Review logs
- Fix and rebuild

---

## 🚀 Publishing Phase (10 minutes)

### Step 1: Login to Marketplace (2 minutes)

```bash
npx vsce login YOUR_PUBLISHER_ID
```

**Enter your Personal Access Token when prompted**

---

### Step 2: Publish (3 minutes)

```bash
npx vsce publish
```

**This will:**
1. Package the extension
2. Upload to marketplace
3. Publish immediately

**Alternative (publish specific version):**
```bash
npx vsce publish 1.0.0
```

---

### Step 3: Verify Publication (5 minutes)

1. **Visit marketplace page**
   ```
   https://marketplace.visualstudio.com/items?itemName=YOUR_PUBLISHER_ID.codelicious
   ```

2. **Check:**
   - [ ] Extension appears
   - [ ] Icon displays correctly
   - [ ] Description is correct
   - [ ] README renders properly
   - [ ] Version is 1.0.0

3. **Test installation from marketplace**
   ```bash
   code --install-extension YOUR_PUBLISHER_ID.codelicious
   ```

---

## 🎉 Post-Publish (20 minutes)

### Step 1: Create GitHub Release (10 minutes)

```bash
# Create and push tag
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

**On GitHub:**
1. Go to Releases → New Release
2. Choose tag: v1.0.0
3. Title: "Codelicious v1.0.0"
4. Description: Copy from CHANGELOG.md
5. Attach: codelicious-1.0.0.vsix
6. Publish release

---

### Step 2: Update README (5 minutes)

**Add marketplace badge:**
```markdown
[![VS Code Marketplace](https://img.shields.io/vscode-marketplace/v/YOUR_PUBLISHER_ID.codelicious.svg)](https://marketplace.visualstudio.com/items?itemName=YOUR_PUBLISHER_ID.codelicious)
[![Installs](https://img.shields.io/vscode-marketplace/i/YOUR_PUBLISHER_ID.codelicious.svg)](https://marketplace.visualstudio.com/items?itemName=YOUR_PUBLISHER_ID.codelicious)
[![Rating](https://img.shields.io/vscode-marketplace/r/YOUR_PUBLISHER_ID.codelicious.svg)](https://marketplace.visualstudio.com/items?itemName=YOUR_PUBLISHER_ID.codelicious)
```

**Update installation instructions:**
```markdown
## Installation

Install from VS Code Marketplace:
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Codelicious"
4. Click Install

Or install via command line:
```bash
code --install-extension YOUR_PUBLISHER_ID.codelicious
```

---

### Step 3: Announce (5 minutes)

**Social Media:**
- Twitter/X
- LinkedIn
- Reddit (r/vscode, r/programming)
- Hacker News

**Example post:**
```
🚀 Just launched Codelicious - an open-source AI development platform for VS Code!

✨ Features:
- Autonomous coding
- Multi-model support (Claude, OpenAI, Gemini, Ollama)
- 200k+ token context
- RAG with semantic search
- 4-8x faster than competitors

🔗 https://marketplace.visualstudio.com/items?itemName=YOUR_PUBLISHER_ID.codelicious

#VSCode #AI #OpenSource #Coding
```

---

## 📊 Monitoring (Ongoing)

### Daily (First Week)
- Check marketplace reviews
- Monitor GitHub issues
- Respond to questions
- Fix critical bugs

### Weekly
- Review analytics
- Check install numbers
- Gather feedback
- Plan improvements

### Monthly
- Release updates
- Add new features
- Update documentation
- Engage community

---

## 🆘 Troubleshooting

### Problem: vsce publish fails

**Error:** "Invalid publisher"
- **Fix:** Update package.json with correct publisher ID

**Error:** "Invalid PAT"
- **Fix:** Regenerate token with Marketplace (Manage) scope

**Error:** "Missing README"
- **Fix:** Ensure README.md exists in root

---

### Problem: Package too large

**Error:** Package > 50MB
- **Fix:** Check .vscodeignore is working
- **Command:** `npx vsce ls` to see what's included
- **Verify:** Source files are excluded

---

### Problem: Extension doesn't activate

**Error:** Extension fails to load
- **Fix:** Check console for errors
- **Check:** dist/extension.js exists
- **Verify:** All dependencies are in package.json

---

### Problem: API keys not saving

**Error:** Keys don't persist
- **Fix:** Check SecretStorage API usage
- **Test:** On different platforms
- **Fallback:** Use configuration file

---

## ✅ Success Checklist

Your extension is successfully published when:

- [x] All 7 critical fixes completed
- [x] All tests pass
- [x] Package built successfully
- [x] Tested locally
- [x] Published to marketplace
- [x] Verified on marketplace
- [x] GitHub release created
- [x] README updated
- [x] Announced on social media

---

## 🎯 Next Steps

After successful launch:

1. **Monitor feedback** (daily)
2. **Fix bugs** (as reported)
3. **Plan v1.1.0** (new features)
4. **Engage community** (respond to issues)
5. **Write blog post** (technical deep dive)
6. **Create video tutorial** (YouTube)
7. **Submit to Product Hunt** (get visibility)

---

## 📞 Need Help?

### Resources
- **VS Code Docs:** https://code.visualstudio.com/api
- **Publishing Guide:** https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- **vsce Docs:** https://github.com/microsoft/vscode-vsce

### Community
- **VS Code Discord:** https://aka.ms/vscode-dev-community
- **Stack Overflow:** [vscode-extensions] tag
- **GitHub Discussions:** Your repo

---

## 🎉 You Got This!

**Total Time:** 1-2 hours  
**Difficulty:** Easy  
**Impact:** Huge!

Follow this plan step-by-step, and you'll have Codelicious published to the VS Code Marketplace in no time.

**Good luck! 🚀**

---

**Created:** 2025-10-30  
**Version:** 1.0.0  
**Status:** Ready to execute

