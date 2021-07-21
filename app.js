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
  postsLiked: [String]
});

userSchema.plugin(passportLocalMongoose);

const User = mongoose.model("User", userSchema);


passport.use(User.createStrategy());

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());




//-----------Routes requests-----------

app.get('/', (req, res) => {
    Post.find((err, posts) => {
        if(req.isAuthenticated()) {
            User.findById(req.user.id, (err, foundUser) => {
                if(err) {
                    console.log(err);
                    res.send("There was an error. Please try again.");
                } else {
                    res.render('home', {newPost: posts, authenticated: req.isAuthenticated()});
                }
            });

        } else {
            res.render('home', {newPost:posts, authenticated: req.isAuthenticated()});
        }
    })
});


app.get("/signin", function(req, res){
  res.render("signin", { authenticated : req.isAuthenticated() });
});

app.get("/signup", function(req, res){
  res.render("signup", { authenticated: req.isAuthenticated() });
});

app.get("/compose", function (req, res) {
  res.render("compose", { authenticated: req.isAuthenticated() });
});

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


app.get("/logout", (req, res) => {
  req.logout();
  res.redirect("/");
});

app.get("/compose", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("compose", { authenticated: req.isAuthenticated() });
  } else {
    res.send("Please login to write a post.");
  }
});

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

app.listen(3000, function () {
  console.log("Server is running on port 3000");
});
