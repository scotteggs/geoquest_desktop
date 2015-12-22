app.config(function ($stateProvider) {

    $stateProvider.state('home', {
        url: '/',
        templateUrl: 'js/home/home.html',
        controller: 'HomeCtrl',
        resolve: {
            requestedUser: function(AuthService) {
                return AuthService.getLoggedInUser();
            }
        }
    });

});

app.controller('HomeCtrl', function ($scope, AuthService, $state, requestedUser) {
    // If there's a logged in user upon load, go to the dashboard
    if (requestedUser) $state.go('dashboard', {userId: requestedUser._id});

    $scope.home = true; // To know what nav links to show
    $scope.login = {};
    $scope.signup = {};
    $scope.loginError = null;
    $scope.signupError = null;

    $scope.sendLogin = function (loginInfo) {
        $scope.error = null;
        console.log('loginInfo', loginInfo)
        AuthService.login(loginInfo).then(function (user) {
            console.log('found existing user', user);
            $state.go('dashboard', {userId: user._id});
        }).catch(function () {
            $scope.loginError = "I think you\'ve entered the wrong info, friend";
        });
    };

    $scope.sendSignup = function(signupInfo) {
        console.log('loginInfo', signupInfo)
        $scope.error = null;
        AuthService.signup(signupInfo).then(function (user) {
            console.log('made new user', user);
            $state.go('dashboard', {userId: user._id}, {reload: true});
        }).catch(function(){
            $scope.signupError = "I'm afraid we already have someone by that name";
        });
    };

    // Paralax effect for images
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