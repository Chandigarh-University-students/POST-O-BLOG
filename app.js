require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const app = express();

app.set("view engine", "ejs");
app.use(express.urlencoded());
app.use(express.static("public"));

//--------Session setup----------
app.use(session({
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false
}));


//--------Initialize passport------
app.use(passport.initialize());


//--------Use Passport to deal with sessions--------
app.use(passport.session());


//---------DB connection---------
mongoose.connect("mongodb://localhost:27017/postoblogDB", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
mongoose.set("useCreateIndex", true);


//--------Post Schema--------
const postSchema = new mongoose.Schema({
  title: String,
  content: String,
  account: String,
  email: String,
  authorId: String,
  timestamp: String,
  likes: Number,
});
const Post = mongoose.model("Post", postSchema);


//--------User Schema--------
const userSchema = new mongoose.Schema({
  userHandle: String,
  email: String,
  password: String,
  // googleId: String,
  posts: [postSchema],
  likedPosts: [String]
});

userSchema.plugin(passportLocalMongoose);

const User = mongoose.model("User", userSchema);


passport.use(User.createStrategy());

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());




//-----------Routes requests-----------

//get Home
app.get('/', (req, res) => {
    Post.find((err, posts) => {
        posts.sort((a, b) => {
          return new Date(b.timestamp) - new Date(a.timestamp);
        });

        if(req.isAuthenticated()) {
            User.findById(req.user.id, (err, foundUser) => {
                if(err) {
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
    })
});

//get SignIn
app.get("/signin", function(req, res){
  res.render("signin", { authenticated : req.isAuthenticated() });
});

//get SignUp
app.get("/signup", function(req, res){
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
app.post('/compose', (req, res) => {
    User.findById(req.user.id, (err, foundUser)=> {
        if(err) {
            console.log(err);
            res.send('Please log in to post.');
        } else {

            const today = new Date();
            const dateTime = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate() + ' ' + today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();

            const post = new Post ({
                title: req.body.postTitle,
                content: req.body.postBody,
                account: foundUser.userHandle,
                email: foundUser.username,
                authorId: req.user.id,
                timestamp: dateTime,
                likes: 0
            });

            post.save();

            foundUser.posts.push(post);

            foundUser.save(() => {
                res.redirect('/');
                console.log(foundUser.posts);
            });
        }
    });
});

//get Profile of others
app.get("/profile", (req, res) => {
  if (req.isAuthenticated()) {
    User.findById(req.user.id, (err, foundUser) => {
      if (err) {
        console.log(err);
        res.send("Please log in to see your profile.");
      } else {
        if (foundUser) {
          console.log(foundUser.posts.length);
          res.render("profile", {
            newPost: foundUser.posts,
            userName: foundUser.userhandle,
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

//get profile of own
app.get("/profile/:profileId", (req, res) => {
  const profileId = req.params.profileId;
  console.log(profileId);
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
                res.render("profile", {
                  newPost: foundUser.posts,
                  userName: foundUser.userHandle,
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
                console.log(foundPost.post);
                if (
                  JSON.stringify(foundMyself._id) ===
                  JSON.stringify(foundPost.authorId)
                ) {
                  res.render("post", {
                    id: foundPost._id,
                    authorId:foundPost.authorId,
                    title: foundPost.title,
                    author: foundPost.account,
                    content: foundPost.content,
                    visitor: false,
                    authenticated: req.isAuthenticated(),
                  });
                } else {
                  res.render("post", {
                    id: foundPost._id,
                    authorId:foundPost.authorId,
                    title: foundPost.title,
                    author: foundPost.account,
                    content: foundPost.content,
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
            authorId:foundPost.authorId,
            title: foundPost.title,
            author: foundPost.account,
            content: foundPost.content,
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
              console.log(foundPost.likes);
              foundPost.save();
              console.log(foundPost.likes);
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
              console.log(foundPost.likes);
              foundPost.save();
              console.log(foundPost.likes);
            }
          });
          res.redirect("/");
        }
      }
    });
  }
});

app.get("/contact", (req, res)=>{
  res.render("contact", { authenticated: req.isAuthenticated() });
});

app.get("/about", (req, res) => {
  res.render("about", { authenticated: req.isAuthenticated() });
});

app.listen(3000, function () {
  console.log("Server is running on port 3000");
});
