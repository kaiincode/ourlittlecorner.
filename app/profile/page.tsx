"use client"

import { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { useAuth } from "@/app/contexts/AuthContext"
import { ProfileService, Profile } from "@/lib/services/profileService"
import { triggerProfileRefresh } from "@/lib/services/profileEvents"
import Navbar from "@/components/navbar"
import Footer from "@/components/footer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Upload, User, Save } from "lucide-react"
import { formatLocalDate } from '@/lib/utils'
import { supabase } from "@/lib/supabase/supabaseClient"

export default function ProfilePage() {
  const { user, loading } = useAuth()
  const [name, setName] = useState("")
  const [bio, setBio] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [successMessage, setSuccessMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [profile, setProfile] = useState<Profile | null>(null)
  const [tableNotExists, setTableNotExists] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Load profile data when user is available
  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return
      
      setIsLoading(true)
      setErrorMessage("")
      setTableNotExists(false)
      
      try {
        const { data, error } = await ProfileService.getProfile(user.id)
        
        if (error) {
          console.error('Error loading profile:', error)
          
          // Check if it's a "table doesn't exist" error
          if (error.message?.includes('relation "profiles" does not exist') || 
              error.code === '42P01') {
            setTableNotExists(true)
            setErrorMessage('Profiles table not set up yet. Please run the SQL setup first.')
            // Fall back to user metadata
            setName(user.user_metadata?.name || user.email?.split('@')[0] || "")
            setBio(user.user_metadata?.bio || "")
            setAvatarUrl(user.user_metadata?.avatar_url || "")
            return
          }
          
          // Check if it's a "no rows" error (profile doesn't exist)
          if (error.code === 'PGRST116') {
            console.log('No profile found, creating one...')
            await createInitialProfile()
            return
          }
          
          // Other errors
          setErrorMessage(`Failed to load profile: ${error.message}`)
          // Fall back to user metadata
          setName(user.user_metadata?.name || user.email?.split('@')[0] || "")
          setBio(user.user_metadata?.bio || "")
          setAvatarUrl(user.user_metadata?.avatar_url || "")
          return
        }
        
        if (data) {
          // Profile exists, use it
          setProfile(data)
          setName(data.name || "")
          setBio(data.bio || "")
          setAvatarUrl(data.avatar_url || "")
        } else {
          // No profile found, create one
          await createInitialProfile()
        }
        
      } catch (error: any) {
        console.error('Unexpected error loading profile:', error)
        setErrorMessage(`An unexpected error occurred: ${error.message}`)
        // Fall back to user metadata
        setName(user.user_metadata?.name || user.email?.split('@')[0] || "")
        setBio(user.user_metadata?.bio || "")
        setAvatarUrl(user.user_metadata?.avatar_url || "")
      } finally {
        setIsLoading(false)
      }
    }

    const createInitialProfile = async () => {
      if (!user) return
      
      try {
        console.log('Creating initial profile for user:', user.id)
        const defaultName = user.user_metadata?.name || user.email?.split('@')[0] || ""
        const defaultBio = user.user_metadata?.bio || ""
        const defaultAvatarUrl = user.user_metadata?.avatar_url || ""
        
        setName(defaultName)
        setBio(defaultBio)
        setAvatarUrl(defaultAvatarUrl)
        
        const { data: newProfile, error: createError } = await ProfileService.createProfile(
          user.id, 
          user.email || "", 
          defaultName
        )
        
        if (createError) {
          console.error('Error creating initial profile:', createError)
          setErrorMessage(`Failed to create profile: ${createError.message}`)
        } else {
          console.log('Profile created successfully:', newProfile)
          setProfile(newProfile)
          setSuccessMessage("Profile created successfully!")
          
          // Trigger profile refresh across all components
          triggerProfileRefresh()
          
          setTimeout(() => setSuccessMessage(""), 3000)
        }
      } catch (error: any) {
        console.error('Unexpected error creating profile:', error)
        setErrorMessage(`Failed to create profile: ${error.message}`)
      }
    }

    if (user) {
      loadProfile()
    }
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    
    // If table doesn't exist, show error
    if (tableNotExists) {
      setErrorMessage('Cannot save profile: Profiles table not set up. Please run the SQL setup first.')
      return
    }
    
    setIsSaving(true)
    setErrorMessage("")
    setSuccessMessage("")
    
    try {
      const updates = {
        name: name.trim() || null,
        bio: bio.trim() || null,
        avatar_url: avatarUrl.trim() || null
      }
      
      let result
      
      // If no profile exists yet, create one, otherwise update
      if (!profile) {
        result = await ProfileService.upsertProfile(user.id, {
          ...updates,
          email: user.email || ""
        })
      } else {
        result = await ProfileService.updateProfile(user.id, updates)
      }
      
      const { data, error } = result
      
      if (error) {
        console.error('Error saving profile:', error)
        setErrorMessage(`Failed to save profile: ${error.message}`)
      } else {
        setProfile(data)
        setSuccessMessage("Profile updated successfully!")
        
        // Trigger profile refresh across all components
        triggerProfileRefresh()
        
        // Clear success message after 3 seconds
        setTimeout(() => {
          setSuccessMessage("")
        }, 3000)
      }
    } catch (error: any) {
      console.error('Unexpected error saving profile:', error)
      setErrorMessage(`An unexpected error occurred: ${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar currentPage="profile" />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin mb-4"></div>
            <p className="text-gray-600 text-sm">Loading profile...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar currentPage="profile" />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-600">Please sign in to view your profile.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Navbar */}
      <Navbar currentPage="profile" />
      
      {/* Subtle background removed for mobile clarity */}
      
      {/* Main content */}
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="max-w-4xl mx-auto">
          {/* Page Title */}
          <motion.div 
            className="mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="font-handwriting text-3xl sm:text-5xl md:text-6xl text-gray-800 mb-2">
              Profile
            </h1>
            <p className="text-gray-600 text-sm">
              Manage your personal information and preferences
            </p>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            {/* Success message */}
            {successMessage && (
              <motion.div 
                className="mb-6"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Alert className="border-green-200 bg-green-50">
                  <AlertDescription className="text-green-700">
                    {successMessage}
                  </AlertDescription>
                </Alert>
              </motion.div>
            )}
            
            {/* Error message */}
            {errorMessage && (
              <motion.div 
                className="mb-6"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Alert className="border-red-200 bg-red-50">
                  <AlertDescription className="text-red-700">
                    {errorMessage}
                    {tableNotExists && (
                      <div className="mt-2 text-xs">
                        <p><strong>To fix this:</strong></p>
                        <ol className="list-decimal list-inside mt-1 space-y-1">
                          <li>Go to your Supabase Dashboard → SQL Editor</li>
                          <li>Run the SQL from <code>supabase_profiles_setup.sql</code></li>
                          <li>Then run <code>migration_create_missing_profiles.sql</code></li>
                          <li>Refresh this page</li>
                        </ol>
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              </motion.div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
              {/* Profile Info Card */}
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Profile Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Avatar Section */}
                  <div className="flex flex-col items-center space-y-4">
                    <Avatar className="w-24 h-24">
                      <AvatarImage src={avatarUrl} alt="Profile avatar" />
                      <AvatarFallback className="text-2xl bg-gradient-to-r from-pink-100 to-pink-200 text-gray-800">
                        {name.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                    
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file || !user) return
                        setIsUploading(true)
                        setErrorMessage("")
                        try {
                          const path = `${user.id}/avatar-${Date.now()}`
                          const { error: upErr } = await supabase
                            .storage
                            .from('avatars')
                            .upload(path, file, { upsert: true, cacheControl: '3600', contentType: file.type })
                          if (upErr) throw upErr
                          const { data } = supabase.storage.from('avatars').getPublicUrl(path)
                          const publicUrl = data.publicUrl
                          setAvatarUrl(publicUrl)
                          // Persist immediately
                          const { error: updErr } = await ProfileService.updateProfile(user.id, { avatar_url: publicUrl })
                          if (updErr) {
                            // fallback: keep in state, show message
                            setErrorMessage(`Saved locally, but failed to persist: ${updErr.message}`)
                          } else {
                            setSuccessMessage('Avatar updated!')
                            triggerProfileRefresh()
                            setTimeout(() => setSuccessMessage(""), 2000)
                          }
                        } catch (err: any) {
                          setErrorMessage(err.message || 'Failed to upload avatar')
                        } finally {
                          setIsUploading(false)
                          if (fileInputRef.current) fileInputRef.current.value = ''
                        }
                      }}
                    />
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="w-full"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {isUploading ? 'Uploading...' : 'Upload Avatar'}
                    </Button>
                  </div>

                  {/* User Info */}
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-500">Email:</span>
                      <p className="font-medium">{user.email}</p>
                    </div>
                    {profile && (
                      <div>
                        <span className="text-gray-500">Last updated:</span>
                        <p className="font-medium">{formatLocalDate(profile.updated_at)}</p>
                      </div>
                    )}
                    {tableNotExists && (
                      <div className="text-orange-600 text-xs">
                        ⚠️ Using fallback data - database not configured
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Edit Form Card */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Edit Profile</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                      <label htmlFor="name" className="text-sm font-medium text-gray-700">
                        Display Name
                      </label>
                      <Input
                        id="name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        maxLength={100}
                        className="font-handwriting text-xl sm:text-3xl md:text-4xl"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label htmlFor="bio" className="text-sm font-medium text-gray-700">
                        Bio
                      </label>
                      <Textarea
                        id="bio"
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="Tell us a bit about yourself"
                        rows={4}
                        maxLength={500}
                        className="font-handwriting text-lg sm:text-3xl md:text-4xl leading-relaxed resize-none"
                      />
                      <p className="text-xs text-gray-500">
                        {bio.length}/500 characters
                      </p>
                    </div>
                    
                    <div className="flex justify-end pt-4">
                      <Button
                        type="submit"
                        disabled={isSaving || tableNotExists}
                        className="min-w-[120px]"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {isSaving ? 'Saving...' : tableNotExists ? 'Setup Required' : 'Save Changes'}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        </div>
      </main>
      
      <Footer />
    </div>
  )
}