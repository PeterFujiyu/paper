import bcrypt from 'bcryptjs'
import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose'

export interface User {
  email: string
  password: string
  name: string
  tokenVersion: number
  createdAt?: Date
  updatedAt?: Date
}

interface UserMethods {
  comparePassword(candidate: string): Promise<boolean>
}

interface UserStatics {
  hashPassword(plain: string): Promise<string>
}

type UserModel = Model<User, Record<string, never>, UserMethods> & UserStatics
type UserDocument = HydratedDocument<User, UserMethods>

const userSchema = new Schema<User, UserModel, UserMethods>(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, select: false },
    name: { type: String, required: true },
    // Increment on logout to invalidate all outstanding JWTs for this user.
    tokenVersion: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
)

const BCRYPT_COST = 12

// Exposed as a static so update paths that bypass the pre-save hook (e.g. an
// atomic findOneAndUpdate) hash at the same cost instead of re-deriving it.
userSchema.statics.hashPassword = function (plain: string) {
  return bcrypt.hash(plain, BCRYPT_COST)
}

userSchema.pre('save', async function (this: UserDocument) {
  if (!this.isModified('password')) return
  this.password = await bcrypt.hash(this.password, BCRYPT_COST)
})

userSchema.methods.comparePassword = function (candidate: string) {
  return bcrypt.compare(candidate, this.password)
}

const UserModelInstance =
  (mongoose.models.User as UserModel | undefined) ??
  mongoose.model<User, UserModel>('User', userSchema)

export default UserModelInstance
