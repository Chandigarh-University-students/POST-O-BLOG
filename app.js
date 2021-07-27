const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "./.env") });
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const findOrCreate = require("mongoose-findorcreate");
const methodOverride = require("method-override");
const marked = require("marked");
const createDomPurify = require("dompurify");
const { JSDOM } = require("jsdom");
const dompurify = createDomPurify(new JSDOM().window);

const app = express();

app.set("view engine", "ejs");
app.use(express.urlencoded());
app.use(express.static("public"));
app.use(methodOverride("_method"));

//--------Session setup----------
app.use(
  session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

//--------Initialize passport------
app.use(passport.initialize());

//--------Use Passport to deal with sessions--------
app.use(passport.session());

//---------DB connection---------
mongoose.connect(process.env.ATLAS_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
mongoose.set("useCreateIndex", true);

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", function () {
  console.log("connected");
});

//--------Post Schema--------
const postSchema = new mongoose.Schema({
  title: String,
  content: String, 
  markdown: String,
  account: String,
  email: String,
  authorId: String,
  timestamp: String,
  likes: Number,
  sanitizedHtml:{
    type: String,
    required: true
  }
});

postSchema.pre("validate", function(next){
  if(this.markdown){
    this.sanitizedHtml = dompurify.sanitize(marked(this.markdown))
  }
  next();
})
const Post = mongoose.model("Post", postSchema);

//--------User Schema--------
const userSchema = new mongoose.Schema({
  userHandle: String,
  email: String,
  password: String,
  googleId: String,
  posts: [postSchema],
  likedPosts: [String],
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = mongoose.model("User", userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(function (id, done) {
  User.findById(id, function (err, user) {
    done(err, user);
  });
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL: "https://post-o-blog.herokuapp.com/auth/google/callback",
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    function (accessToken, refreshToken, profile, cb) {
      User.findOrCreate(
        {
          googleId: profile.id,
          userHandle: profile.displayName,
          username: profile.emails[0]["value"],
        },
        function (err, user) {
          return cb(err, user);
        }
      );
    }
  )
);

//-----------Routes requests-----------

//get Home
app.get("/", (req, res) => {
  Post.find((err, posts) => {
    posts.sort((a, b) => {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    if (req.isAuthenticated()) {
      User.findById(req.user.id, (err, foundUser) => {
        if (err) {
          console.log(err);
          res.send("There was an error. Please try again.");
        } else {
          res.render("home", {
            newPost: posts,
            authenticated: req.isAuthenticated(),
            userLikedPosts: foundUser.likedPosts,
          });
        }
      });
    } else {
      res.render("home", {
        newPost: posts,
        authenticated: req.isAuthenticated(),
        userLikedPosts: null,
      });
    }
  });
});

//Google Oauth
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/signin",
    successRedirect: "/",
  })
);

//get SignIn
app.get("/signin", function (req, res) {
  res.render("signin", { authenticated: req.isAuthenticated() });
});

//get SignUp
app.get("/signup", function (req, res) {
  res.render("signup", { authenticated: req.isAuthenticated() });
});

//post SignUp
app.post("/signup", (req, res) => {
  User.register(
    { username: req.body.username, userHandle: req.body.userhandle },
    req.body.password,
    (err, user) => {
      if (err) {
        console.log(err);
        res.redirect("/signup");
      } else {
        passport.authenticate("local")(req, res, () => {
          res.redirect("/");
        });
      }
    }
  );
});

//post SignIn
app.post("/signin", (req, res) => {
  const user = new User({
    username: req.body.username,
    password: req.body.password,
  });

  req.login(user, (err) => {
    if (err) {
      console.log(err);
      res.send("Incorrect email or password");
    } else {
      passport.authenticate("local")(req, res, () => {
        res.redirect("/");
      });
    }
  });
});

//get LogOut
app.get("/logout", (req, res) => {
  req.logout();
  res.redirect("/");
});

//get Compose
app.get("/compose", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("compose", { authenticated: req.isAuthenticated() });
  } else {
    res.send("Please login to write a post.");
  }
});

//post Compose
app.post("/compose", (req, res) => {
  User.findById(req.user.id, (err, foundUser) => {
    if (err) {
      console.log(err);
      res.send("Please log in to post.");
    } else {
      const today = new Date();
      const dateTime =
        today.getFullYear() +
        "-" +
        (today.getMonth() + 1) +
        "-" +
        today.getDate() +
        " " +
        today.getHours() +
        ":" +
        today.getMinutes() +
        ":" +
        today.getSeconds();

      const post = new Post({
        title: req.body.postTitle,
        content: req.body.postBody,
        markdown: req.body.postMarkdown,
        account: foundUser.userHandle,
        email: foundUser.username,
        authorId: req.user.id,
        timestamp: dateTime,
        likes: 0,
      });

      post.save();

      foundUser.posts.push(post);

      foundUser.save(() => {
        res.redirect("/");
      });
    }
  });
});

//get Profile of own
app.get("/profile", (req, res) => {
  if (req.isAuthenticated()) {
    User.findById(req.user.id, (err, foundUser) => {
      if (err) {
        console.log(err);
        res.send("Please log in to see your profile.");
      } else {
        if (foundUser) {
          profile_name = foundUser.userHandle;
          profile_name.replace(/\s+/g, "");
          res.render("profile", {
            newPost: foundUser.posts,
            userName: profile_name,
            authenticated: req.isAuthenticated(),
            visitor: false,
          });
        } else {
          res.send("Please log in to see your profile.");
        }
      }
    });
  } else {
    res.send("Please log in to see your profile.");
  }
});

//get profile of others
app.get("/profile/:profileId", (req, res) => {
  const profileId = req.params.profileId;
  User.findById(profileId, (err, foundUser) => {
    if (err) {
      console.log(err);
      res.send("User not found");
    } else {
      if (req.isAuthenticated()) {
        User.findById(req.user.id, (err, foundMyself) => {
          if (err) {
            console.log(err);
            res.send("Please login to see this profile");
          } else {
            if (foundMyself) {
              if (
                JSON.stringify(foundMyself._id) ===
                JSON.stringify(foundUser._id)
              ) {
                profile_name = foundUser.userHandle;
                profile_name.replace(/\s+/g, "");
                res.render("profile", {
                  newPost: foundUser.posts,
                  userName: profile_name,
                  authenticated: req.isAuthenticated(),
                  visitor: false,
                });
              } else {
                res.render("profile", {
                  newPost: foundUser.posts,
                  userName: foundUser.userHandle,
                  authenticated: req.isAuthenticated(),
                  visitor: true,
                });
              }
            } else {
              res.send("Please login to see this profile");
            }
          }
        });
      } else {
        res.render("profile", {
          newPost: foundUser.posts,
          userName: foundUser.userHandle,
          authenticated: req.isAuthenticated(),
          visitor: true,
        });
      }
    }
  });
});

//get Particular Post
app.get("/posts/:postId", (req, res) => {
  const requestedPostId = req.params.postId;
  Post.findById(requestedPostId, (err, foundPost) => {
    if (err) {
      console.log(err);
      res.send("There was an error retrieving the post.");
    } else {
      if (foundPost) {
        if (req.isAuthenticated()) {
          User.findById(req.user.id, (err, foundMyself) => {
            if (err) {
              console.log(err);
              res.send("Please login to see this post");
            } else {
              if (foundMyself) {
                if (
                  JSON.stringify(foundMyself._id) ===
                  JSON.stringify(foundPost.authorId)
                ) {
                  res.render("post", {
                    id: foundPost._id,
                    authorId: foundPost.authorId,
                    title: foundPost.title,
                    author: foundPost.account,
                    content: foundPost.content,
                    markdown: foundPost.sanitizedHtml,
                    visitor: false,
                    authenticated: req.isAuthenticated(),
                  });
                } else {
                  res.render("post", {
                    id: foundPost._id,
                    authorId: foundPost.authorId,
                    title: foundPost.title,
                    author: foundPost.account,
                    content: foundPost.content,
                    markdown: foundPost.sanitizedHtml,
                    visitor: true,
                    authenticated: req.isAuthenticated(),
                  });
                }
              } else {
                res.send("Please login to see this post");
              }
            }
          });
        } else {
          res.render("post", {
            id: foundPost._id,
            authorId: foundPost.authorId,
            title: foundPost.title,
            author: foundPost.account,
            content: foundPost.content,
            markdown: foundPost.sanitizedHtml,
            visitor: true,
            authenticated: req.isAuthenticated(),
          });
        }
      }
    }
  });
});

//post Like
app.post("/like", (req, res) => {
  const liked = req.body.liked;
  const postId = req.body.postId;

  if (req.isAuthenticated()) {
    User.findById(req.user.id, (err, foundUser) => {
      if (err) {
        console.log(err);
        res.send("There was an error. Please try again.");
      } else {
        if (liked === "true") {
          foundUser.likedPosts.push(postId);
          foundUser.save();
          Post.findById(postId, (err, foundPost) => {
            if (err) {
              console.log(err);
              res.send("There was an error");
            } else {
              foundPost.likes++;
              foundPost.save();
            }
          });
          res.redirect("/");
        } else {
          foundUser.likedPosts.splice(foundUser.likedPosts.indexOf(postId), 1);
          foundUser.save();
          Post.findById(postId, (err, foundPost) => {
            if (err) {
              console.log(err);
              res.send("There was an error");
            } else {
              foundPost.likes--;
              foundPost.save();
            }
          });
          res.redirect("/");
        }
      }
    });
  }
});

//delete post
app.post("/delete", (req, res) => {
  const postId = req.body.postId;

  Post.findById(postId, (err, foundPost) => {
    if (err) {
      console.log(err);
      res.send("Post not found.");
    } else {
      if (foundPost) {
        const userId = foundPost.authorId;

        User.findById(userId, (err, foundUser) => {
          if (err) {
            console.log(err);
            res.send("There was an error. Please try again.");
          } else {
            if (foundUser) {
              for (let i = 0; i < foundUser.posts.length; i++) {
                if (
                  JSON.stringify(foundUser.posts[i]["_id"]) ===
                  JSON.stringify(postId)
                ) {
                  foundUser.posts.splice(i, 1);
                  foundUser.save();
                  break;
                }
              }
            } else {
              res.send("User not found");
            }
          }
        });

        Post.findByIdAndDelete(postId, (err, deletedPost) => {
          if (err) {
            console.log(err);
            res.send("There was an error. Please try again.");
          } else {
            if (deletedPost) {
              console.log(deletedPost);
              res.redirect("/profile");
            }
          }
        });
      } else {
        res.send("Post not found");
      }
    }
  });
});

app.get("/contact", (req, res) => {
  res.render("contact", { authenticated: req.isAuthenticated() });
});

app.get("/about", (req, res) => {
  res.render("about", { authenticated: req.isAuthenticated() });
});

let port = process.env.PORT;
if (port == null || port == "") {
  port = 3000;
}

app.listen(port, function () {
  console.log("Server has started successfully");
});


