app.config(function ($stateProvider) {

    $stateProvider.state('auth', {
        url: '/auth',
        templateUrl: 'js/auth/auth.html',
        controller: 'AuthCtrl'
    });

});

app.controller('AuthCtrl', function ($scope, AuthService, $state) {
    $scope.login = {};
    $scope.signup = {};
    $scope.error = null;
    $scope.sendLogin = function (loginInfo) {

        $scope.error = null;

        AuthService.login(loginInfo).then(function (user) {
            $state.go('dashboard', {userId: user._id});
        }).catch(function () {
            $scope.error = 'Either you\'ve entered the wrong info, or we already have someone by that name';
        });

    };

    $scope.sendSignup = function(signupInfo) {
        $scope.error = null;
        AuthService.signup(signupInfo).then(function (user) {
            $state.go('dashboard', {userId: user._id}, {reload: true});
        }).catch(function(){
            $scope.error = "Invalid Signup Credentials";
        });
    };

    // PARALAX EFFECT
    $(function() {
    // Cache the window object (makes load time faster)
    var $window = $(window);
    // Parallax background effect
    $('section[data-type="background"]').each(function() {
        var $bgobj = $(this); // assigning the object
        $(window).scroll(function() {
            //scroll the background at var speed
            // the yPos is a negative because we're scrolling it up
            var yPos = -($window.scrollTop() / $bgobj.data('speed'));
            // Put together our final background position
            var coords = '50% ' + yPos + 'px';
            // Move the background
            $bgobj.css({ backgroundPosition: coords });
        }); // end window scroll
    });
});



});