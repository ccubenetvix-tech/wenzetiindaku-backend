const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

/**
 * Configure Google OAuth strategy
 */
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.NODE_ENV === 'production' 
    ? "https://wenzetiindaku-backend-ccubenetvix-tech2481-dp5p5n4l.leapcell.dev/api/auth/google/callback"
    : "/api/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Extract user information from Google profile
    const user = {
      id: profile.id,
      displayName: profile.displayName,
      emails: profile.emails,
      photos: profile.photos
    };

    return done(null, user);
  } catch (error) {
    console.error('Google OAuth error:', error);
    return done(error, null);
  }
}));

/**
 * Serialize user for session
 */
passport.serializeUser((user, done) => {
  done(null, user);
});

/**
 * Deserialize user from session
 */
passport.deserializeUser((user, done) => {
  done(null, user);
});

module.exports = passport;

