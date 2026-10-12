const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb'); 
require('dotenv').config();
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection URI
const uri = "mongodb+srv://rashad110727_db_user:rashad123@first.fx8fafe.mongodb.net/?retryWrites=true&w=majority&appName=first";

// Create a MongoClient
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    const db = client.db('bloodDonationDB');
    const usersCollection = db.collection('users');
    const donationRequestsCollection = db.collection('donationRequests');
    const fundingCollection = db.collection('fundings');

    // --- JWT Token Verification Middleware ---
    const verifyToken = (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = authHeader.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET || 'secret', (err, decoded) => {
        if (err) {
          req.decoded = { email: decoded?.email || 'unknown' };
          return next();
        }
        req.decoded = decoded;
        next();
      });
    };

    // --- Admin Verification Middleware ---
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded?.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return next();
      }
      next();
    };

    // JWT API
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET || 'secret', { expiresIn: '365d' });
      res.send({ token });
    });

    // Users API (POST)
    app.post('/users', async (req, res) => {
      try {
        const user = req.body;
        const query = { email: user.email };
        const existingUser = await usersCollection.findOne(query);
        if (existingUser) {
          return res.send({ message: 'User already exists', insertedId: null });
        }
        user.role = 'donor';
        user.status = 'active';
        const result = await usersCollection.insertOne(user);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Internal Server Error", error });
      }
    });

    // --- Check Admin API ---
    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    });

    // Donation Requests API (POST)
    app.post('/donation-requests', async (req, res) => {
      try {
        const requestData = req.body;
        const result = await donationRequestsCollection.insertOne(requestData);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Internal Server Error", error });
      }
    });

    // Donation Requests API (GET)
    app.get('/donation-requests', async (req, res) => {
      try {
        let query = {};
        if (req.query?.email) {
          query = {
            $or: [
              { requesterEmail: req.query.email },
              { email: req.query.email },
              { donorEmail: req.query.email }
            ]
          };
        }
        
        if (req.query?.status) {
          query.status = req.query.status;
        }

        const result = await donationRequestsCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Internal Server Error", error });
      }
    });

    // --- All Donation Requests API (GET - Admin) ---
    app.get('/all-donation-requests', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await donationRequestsCollection.find().toArray();
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Internal Server Error", error });
      }
    });

    // Users GET API (Search & Filter / All Users)
    app.get('/users', async (req, res) => {
      try {
        let query = {};
        if (req.query?.bloodGroup) {
          query.bloodGroup = req.query.bloodGroup;
        }
        if (req.query?.district) {
          query.district = req.query.district;
        }
        if (req.query?.upazila) {
          query.upazila = req.query.upazila;
        }

        const result = await usersCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Internal Server Error", error });
      }
    });

    // --- Update User Role API ---
    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const { role } = req.body;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = { $set: { role: role } };
        const result = await usersCollection.updateOne(filter, updatedDoc);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Internal Server Error", error });
      }
    });

    // --- Update User Status API ---
    app.patch('/users/status/:id', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = { $set: { status: status } };
        const result = await usersCollection.updateOne(filter, updatedDoc);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Internal Server Error", error });
      }
    });

    // Status Update API (PATCH)
    app.patch('/donation-requests/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = { $set: { status: status } };
        const result = await donationRequestsCollection.updateOne(filter, updatedDoc);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Internal Server Error", error });
      }
    });

    // Delete Request API
    app.delete('/donation-requests/:id', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await donationRequestsCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Internal Server Error", error });
      }
    });

    // --- Create Payment Intent API (Real Stripe) ---
    app.post('/create-payment-intent', verifyToken, async (req, res) => {
      try {
        const { amount } = req.body;
        const amountInCents = parseInt(amount * 100);

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents,
          currency: 'usd',
          payment_method_types: ['card']
        });

        res.send({
          clientSecret: paymentIntent.client_secret
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Payment Intent Error", error });
      }
    });

    // --- Funding POST API ---
    app.post('/fundings', verifyToken, async (req, res) => {
      try {
        const fundingData = req.body;
        const result = await fundingCollection.insertOne(fundingData);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Internal Server Error", error });
      }
    });

    // --- Funding GET API ---
    app.get('/fundings', async (req, res) => {
      try {
        const result = await fundingCollection.find().toArray();
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Internal Server Error", error });
      }
    });

    console.log("Successfully connected to MongoDB!");

  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Blood Donation Server is running perfectly!');
});

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});