Pod::Spec.new do |s|
  s.name           = 'StoreSearch'
  s.version        = '1.0.0'
  s.summary        = 'Supermarket search with Apple MapKit for Psst!'
  s.description    = 'Local Expo module wrapping MKLocalPointsOfInterestRequest / MKLocalSearch.'
  s.author         = 'Psst!'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.license        = 'UNLICENSED'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'MapKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files   = '**/*.{h,m,mm,swift}'
end
