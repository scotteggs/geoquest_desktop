app.directive('resolveLoader', function($rootScope, $timeout) {

  return {
    restrict: 'E',
    replace: true,
    template: '<div class="alert alert-success ng-hide"><strong>Loading up! Just a sec..</strong></div>',
    link: function(scope, element) {
      $rootScope.$on('$stateChangeStart', function(event, currentRoute, previousRoute) {

        $timeout(function() {
          element.removeClass('ng-hide');
        });
      });

      $rootScope.$on('$stateChangeSuccess', function() {
        element.addClass('ng-hide');
      });
    }
  };
});