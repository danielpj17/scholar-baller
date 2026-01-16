# Migration Notes

## Upgrading from Previous Version

If you were using Scholar Baller before this update, your data was stored in browser localStorage. The new version uses a Neon PostgreSQL database for better persistence and duplicate prevention.

### What Changed?

1. **Scholarships**: Now stored in database instead of browser memory
2. **User Profile**: Automatically synced to database
3. **Duplicate Prevention**: URLs are checked against database to avoid re-analyzing
4. **Pagination**: Scans 5-10 pages per source (was 1 page before)
5. **New Pages**: Separate views for All/Saved/Applied scholarships

### Your Data is Safe

Your profile data will automatically migrate:
- On first load, the app checks the database
- If no profile exists in database, it loads from localStorage
- Then saves to database for future use
- Your localStorage data remains as backup

### What You Need to Do

1. **Set up Neon database** (see SETUP_GUIDE.md)
2. **Add DATABASE_URL to .env.local**
3. **Visit /api/init-db** to create tables
4. **Refresh the app** - your profile will auto-migrate

### Previous Scholarships

Scholarships from before the update were only in browser memory and are not migrated. You'll need to:
- Re-scan for scholarships (they'll be saved to database this time)
- The new scan will find many more scholarships due to pagination

### Benefits of the Update

- **No more duplicates**: Database tracks all discovered URLs
- **Persistent storage**: Data survives browser cache clears
- **Better organization**: Dedicated pages for saved/applied scholarships
- **More scholarships**: Pagination finds 50-100 per scan vs 10-30 before
- **Essay generation**: New AI-powered essay writing feature
- **Cross-device**: Access your data from any browser (with same database)

### Troubleshooting

**Q: I don't see my old scholarships**
A: They were stored in browser memory only. Run a new scan to populate the database.

**Q: My profile didn't migrate**
A: Go to Settings and verify your information. Click "Save Profile" to ensure it's in the database.

**Q: Can I export my old data?**
A: Old scholarship data was temporary. The new system is designed for long-term storage.

### Database Schema

For reference, here's what's stored:

**scholarships table**:
- All discovered scholarships
- Analysis results
- Essays
- Saved/Applied status

**user_profiles table**:
- Your complete profile
- Updated whenever you change settings

Both tables include timestamps for tracking when data was added/updated.
