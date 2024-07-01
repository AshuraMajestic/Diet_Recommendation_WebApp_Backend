require('dotenv').config();
const express = require('express');
const cors = require('cors');
require('./db/conn');
const app = express();
const port = process.env.PORT || 5000;
const cookieParser = require('cookie-parser');
const User = require('../src/db/model/user');
const signupSchema = require('../src/validators/auth-validator');
const validate = require('../src/middlewares/validate-middleware');
const { Disease, FoodItem } = require('../src/db/model/FoodItem');



// Set up CORS
app.use(cors());

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.json());
app.options('*', cors());


//Register

app.post('/register', validate(signupSchema), async (req, res) => {
    try {
        const { username,
            email,
            phone,
            password,
            weight,
            height,
            age,
            gender,
            activityLevel } = req.body;

        // Check if user already exists
        const userExist = await User.findOne({ email });
        if (userExist) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        // Create a new user
        const newUser = await User.create({
            username,
            email,
            phone,
            password,
            weight,
            height,
            isAdmin: false,
            age,
            gender,
            activityLevel
        });

        // Generate token for authentication
        const token = await newUser.generateToken();

        // Respond with success message, token, and user ID
        res.status(200).json({
            message: "Registration Successful",
            token,
            userId: newUser._id.toString()
        });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const userExist = await User.findOne({ email });  // Await the find operation

        if (!userExist) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }
        const user = await userExist.comparePassword(password);
        if (user) {
            res.status(200).json({ msg: "Login Successful", token: await userExist.generateToken(), userId: userExist._id.toString() });
        } else {
            res.status(401).json({ msg: 'Invalid Email or password' });
        }

    } catch (error) {
        res.status(500).json("Internal Server Error: ");
    }
});

app.get('/users', async (req, res) => {
    try {
        const users = await User.find({ isAdmin: false });
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get('/users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        res.status(200).json(user);
    } catch (error) {
        if (error.kind === 'ObjectId') {
            return res.status(400).json({ error: "Invalid User ID" });
        }
        res.status(500).json({ error: "Internal Server Error" });
    }
});
function calculateBmr(weight, height, age, gender) {
    let bmr;

    if (gender === 'Male') {
        bmr = 10 * weight + 6.25 * height - 5 * age + 5;
    } else if (gender === 'Female') {
        bmr = 10 * weight + 6.25 * height - 5 * age - 161;
    } else {
        console.log('Invalid gender');
        return null;
    }

    return bmr;
}

function calculateCalories(bmr, activityLevel) {
    let pal;

    if (activityLevel === 'Sedentary') {
        pal = 1.2;
    } else if (activityLevel === 'Lightly active') {
        pal = 1.375;
    } else if (activityLevel === 'Moderately active') {
        pal = 1.55;
    } else if (activityLevel === 'Very active') {
        pal = 1.725;
    } else if (activityLevel === 'Extra active') {
        pal = 1.9;
    } else {
        console.log('Invalid activity level');
        return null;
    }

    const calories = bmr * pal;
    return calories;
}

app.post('/food-items', async (req, res) => {
    try {
        const { weight, height, age, gender, activityLevel } = req.body;

        if (!weight || !height || !age || !gender || !activityLevel) {
            return res.status(400).json({ error: "Please provide weight, height, age, gender, and activity level" });
        }

        const bmr = calculateBmr(weight, height, age, gender);
        if (bmr === null) {
            return res.status(400).json({ error: "Invalid gender" });
        }

        const dailyCalories = calculateCalories(bmr, activityLevel);
        if (dailyCalories === null) {
            return res.status(400).json({ error: "Invalid activity level" });
        }

        const foodItems = await FoodItem.find({});
        const filteredFoodItems = foodItems.filter(item => item.Calories <= dailyCalories);

        // Selecting first six randomly
        const shuffledFoodItems = shuffleArray(filteredFoodItems);

        // Select the first six items from the shuffled array
        const selectedFoodItems = shuffledFoodItems.slice(0, 6);

        res.status(200).json({ bmr, dailyCalories, filteredFoodItems: selectedFoodItems });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
function tokenAuthorization(req, res, next) {
    let token = req.headers['authorization'];
    if (token) {
        jwt.verify(token, jwtKey, (err, valid) => {
            if (err) {
                res.status(401).send({ result: "Please Provide valid token" })
            } else {
                next();
            }
        })
    } else {
        res.status(403).send("Please add token with header")
    }
}

app.get('/all-food-item', async (req, res) => {
    try {
        const foodItems = await FoodItem.find();
        const shuffledFoodItems = shuffleArray(foodItems);

        // Select the first six items from the shuffled array
        const selectedFoodItems = shuffledFoodItems.slice(0, 6);
        res.json(selectedFoodItems);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST a new food item
app.post('/add-food-item', async (req, res) => {
    const foodItem = new FoodItem({
        food_items: req.body.food_items,
        Avg_Serving_Size: req.body.Avg_Serving_Size,
        Calories: req.body.Calories,
        Category: req.body.Category,
        Carbs: req.body.Carbs,
        Total_Fat: req.body.Total_Fat,
        Saturated_Fat: req.body.Saturated_Fat,
        Protein: req.body.Protein,
        Fiber: req.body.Fiber,
        Cholesterol: req.body.Cholesterol,
        Sodium: req.body.Sodium,
        Sugar: req.body.Sugar,
        Potassium: req.body.Potassium,
        Magnesium: req.body.Magnesium,
        Phosphorus: req.body.Phosphorus,
        Vitamin_C: req.body.Vitamin_C,
        Vitamin_A: req.body.Vitamin_A,
        Calcium: req.body.Calcium,
        Iron: req.body.Iron,
        Zinc: req.body.Zinc,
        Vitamin_E: req.body.Vitamin_E,
        Vitamin_K: req.body.Vitamin_K
    });

    try {
        const newFoodItem = await foodItem.save();
        res.status(201).json(newFoodItem);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// app.post('/user-details', async (req, res) => {
//     const { userId, weight, height, age, gender, activityLevel } = req.body;

//     try {
//         // Check if userId exists
//         const user = await User.findById(userId);
//         if (!user) {
//             return res.status(404).json({ error: "User not found" });
//         }

//         // Create new user detail object
//         const newUserDetail = new UserDetail({
//             userId,
//             weight,
//             height,
//             age,
//             gender,
//             activityLevel
//         });

//         // Save user detail to database
//         const savedUserDetail = await newUserDetail.save();

//         // Update user document with userDetails reference
//         user.userDetails = savedUserDetail._id;
//         await user.save();

//         res.status(201).json({ message: "User details added successfully", userDetails: savedUserDetail });
//     } catch (error) {
//         console.error('Error adding user details:', error);
//         res.status(500).json({ error: "Internal Server Error" });
//     }
// });


// Start the server
app.listen(port, () => {
    console.log("Listening on port " + port);
});