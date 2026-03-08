import bcrypt from 'bcryptjs'
import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose'

export interface User {
  email: string
  password: string
  name: string
  createdAt?: Date
  updatedAt?: Date
}

interface UserMethods {
  comparePassword(candidate: string): Promise<boolean>
}

type UserModel = Model<User, Record<string, never>, UserMethods>
type UserDocument = HydratedDocument<User, UserMethods>

const userSchema = new Schema<User, UserModel, UserMethods>(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, select: false },
    name: { type: String, required: true },
  },
  { timestamps: true }
)

userSchema.pre('save', async function (this: UserDocument) {
  if (!this.isModified('password')) return
  this.password = await bcrypt.hash(this.password, 12)
})

userSchema.methods.comparePassword = function (candidate: string) {
  return bcrypt.compare(candidate, this.password)
}

const UserModelInstance =
  (mongoose.models.User as UserModel | undefined) ??
  mongoose.model<User, UserModel>('User', userSchema)

export default UserModelInstance
