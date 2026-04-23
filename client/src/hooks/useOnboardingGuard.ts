import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

/**
 * useOnboardingGuard
 *
 * Call this at the top of any protected page component.
 * If the authenticated user has not completed onboarding (or has no assignedStoreId),
 * they are immediately redirected to /onboarding.
 *
 * Returns { isReady } — true once auth + profile have loaded and the user is cleared to view the page.
 * While isReady is false, the calling component should render null or a loading skeleton.
 */
export function useOnboardingGuard(): { isReady: boolean } {
  const [, navigate] = useLocation();
  const { isAuthenticated, loading: authLoading } = useAuth();

  const { data: profile, isLoading: profileLoading } = trpc.user.profile.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  useEffect(() => {
    // Wait for both auth and profile to resolve
    if (authLoading || profileLoading) return;
    // Not authenticated — Login page handles this
    if (!isAuthenticated) return;
    // Profile loaded but onboarding incomplete or store not assigned
    if (profile && (!profile.onboardingComplete || !profile.assignedStoreId)) {
      navigate("/onboarding");
    }
  }, [authLoading, profileLoading, isAuthenticated, profile, navigate]);

  const isReady =
    !authLoading &&
    !profileLoading &&
    isAuthenticated &&
    !!profile?.onboardingComplete &&
    !!profile?.assignedStoreId;

  return { isReady };
}
