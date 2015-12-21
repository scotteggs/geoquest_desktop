app.directive('resolveLoader', function($rootScope, $timeout) {

  return {
    restrict: 'E',
    replace: true,
    template: '<div class="alert alert-success ng-hide"><strong>Loading up!</strong></div>',
    link: function(scope, element) {
      console.log('loading dir');
      $rootScope.$on('$stateChangeStart', function(event, currentRoute, previousRoute) {
        console.log('change start');
        //if (previousRoute) return;

        $timeout(function() {
          element.removeClass('ng-hide');
        });
      });

      $rootScope.$on('$routeChangeSuccess', function() {
        console.log('routeChangeSuccess');
        element.addClass('ng-hide');
      });
    }
  };
});